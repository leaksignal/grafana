import { toDataFrame } from '../../dataframe/processDataFrame';
import { FieldType } from '../../types/dataFrame';
import { mockTransformationsRegistry } from '../../utils/tests/mockTransformationsRegistry';
import { ArrayVector } from '../../vector';

import { calculateFieldTransformer } from './calculateField';
import { JoinMode } from './joinByField';
import { isLikelyAscendingVector, joinDataFrames } from './joinDataFrames';

describe('align frames', () => {
  beforeAll(() => {
    mockTransformationsRegistry([calculateFieldTransformer]);
  });

  describe('by first time field', () => {
    const series1 = toDataFrame({
      fields: [
        { name: 'TheTime', type: FieldType.time, values: [1000, 2000] },
        { name: 'A', type: FieldType.number, values: [1, 100] },
      ],
    });
    const series2 = toDataFrame({
      fields: [
        { name: '_time', type: FieldType.time, values: [1000, 1500, 2000] },
        { name: 'A', type: FieldType.number, values: [2, 20, 200] },
        { name: 'B', type: FieldType.number, values: [3, 30, 300] },
        { name: 'C', type: FieldType.string, values: ['first', 'second', 'third'] },
      ],
    });

    it('should perform an outer join', () => {
      const out = joinDataFrames({ frames: [series1, series2] })!;
      expect(
        out.fields.map((f) => ({
          name: f.name,
          values: f.values.toArray(),
        }))
      ).toMatchInlineSnapshot(`
        [
          {
            "name": "TheTime",
            "values": [
              1000,
              1500,
              2000,
            ],
          },
          {
            "name": "A",
            "values": [
              1,
              undefined,
              100,
            ],
          },
          {
            "name": "A",
            "values": [
              2,
              20,
              200,
            ],
          },
          {
            "name": "B",
            "values": [
              3,
              30,
              300,
            ],
          },
          {
            "name": "C",
            "values": [
              "first",
              "second",
              "third",
            ],
          },
        ]
      `);
    });

    it('should perform an inner join', () => {
      const out = joinDataFrames({ frames: [series1, series2], mode: JoinMode.inner })!;
      expect(
        out.fields.map((f) => ({
          name: f.name,
          values: f.values.toArray(),
        }))
      ).toMatchInlineSnapshot(`
        [
          {
            "name": "TheTime",
            "values": [
              1000,
              2000,
            ],
          },
          {
            "name": "A",
            "values": [
              1,
              100,
            ],
          },
          {
            "name": "A",
            "values": [
              2,
              200,
            ],
          },
          {
            "name": "B",
            "values": [
              3,
              300,
            ],
          },
          {
            "name": "C",
            "values": [
              "first",
              "third",
            ],
          },
        ]
      `);
    });
  });

  it('unsorted input keep indexes', () => {
    //----------
    const series1 = toDataFrame({
      fields: [
        { name: 'TheTime', type: FieldType.time, values: [1000, 2000, 1500] },
        { name: 'A1', type: FieldType.number, values: [1, 2, 15] },
      ],
    });

    const series3 = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [2000, 1000] },
        { name: 'A2', type: FieldType.number, values: [2, 1] },
      ],
    });

    let out = joinDataFrames({ frames: [series1, series3], keepOriginIndices: true })!;
    expect(
      out.fields.map((f) => ({
        name: f.name,
        values: f.values.toArray(),
        state: f.state,
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "TheTime",
          "state": {
            "origin": {
              "fieldIndex": 0,
              "frameIndex": 0,
            },
          },
          "values": [
            1000,
            1500,
            2000,
          ],
        },
        {
          "name": "A1",
          "state": {
            "origin": {
              "fieldIndex": 1,
              "frameIndex": 0,
            },
          },
          "values": [
            1,
            15,
            2,
          ],
        },
        {
          "name": "A2",
          "state": {
            "origin": {
              "fieldIndex": 1,
              "frameIndex": 1,
            },
          },
          "values": [
            1,
            undefined,
            2,
          ],
        },
      ]
    `);

    // Fast path still adds origin indecies
    out = joinDataFrames({ frames: [series1], keepOriginIndices: true })!;
    expect(
      out.fields.map((f) => ({
        name: f.name,
        state: f.state,
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "TheTime",
          "state": {
            "origin": {
              "fieldIndex": 0,
              "frameIndex": 0,
            },
          },
        },
        {
          "name": "A1",
          "state": {
            "origin": {
              "fieldIndex": 1,
              "frameIndex": 0,
            },
          },
        },
      ]
    `);
  });

  it('sort single frame as index zero', () => {
    const series1 = toDataFrame({
      fields: [
        { name: 'A1', type: FieldType.number, values: [1, 22, 15] },
        { name: 'TheTime', type: FieldType.time, values: [6000, 2000, 1500] },
      ],
    });

    const out = joinDataFrames({ frames: [series1], keepOriginIndices: true })!;
    expect(
      out.fields.map((f) => ({
        name: f.name,
        values: f.values.toArray(),
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "TheTime",
          "values": [
            1500,
            2000,
            6000,
          ],
        },
        {
          "name": "A1",
          "values": [
            15,
            22,
            1,
          ],
        },
      ]
    `);
  });

  it('supports duplicate times', () => {
    //----------
    // NOTE!!!
    // * ideally we would *keep* dupicate fields
    //----------
    const series1 = toDataFrame({
      fields: [
        { name: 'TheTime', type: FieldType.time, values: [1000, 2000] },
        { name: 'A', type: FieldType.number, values: [1, 100] },
      ],
    });

    const series3 = toDataFrame({
      fields: [
        { name: 'Time', type: FieldType.time, values: [1000, 1000, 1000] },
        { name: 'A', type: FieldType.number, values: [2, 20, 200] },
      ],
    });

    const out = joinDataFrames({ frames: [series1, series3] })!;
    expect(
      out.fields.map((f) => ({
        name: f.name,
        values: f.values.toArray(),
      }))
    ).toMatchInlineSnapshot(`
      [
        {
          "name": "TheTime",
          "values": [
            1000,
            2000,
          ],
        },
        {
          "name": "A",
          "values": [
            1,
            100,
          ],
        },
        {
          "name": "A",
          "values": [
            200,
            undefined,
          ],
        },
      ]
    `);
  });

  describe('check ascending data', () => {
    it('simple ascending', () => {
      const v = new ArrayVector([1, 2, 3, 4, 5]);
      expect(isLikelyAscendingVector(v)).toBeTruthy();
    });
    it('simple ascending with null', () => {
      const v = new ArrayVector([null, 2, 3, 4, null]);
      expect(isLikelyAscendingVector(v)).toBeTruthy();
    });
    it('single value', () => {
      const v = new ArrayVector([null, null, null, 4, null]);
      expect(isLikelyAscendingVector(v)).toBeTruthy();
      expect(isLikelyAscendingVector(new ArrayVector([4]))).toBeTruthy();
      expect(isLikelyAscendingVector(new ArrayVector([]))).toBeTruthy();
    });

    it('middle values', () => {
      const v = new ArrayVector([null, null, 5, 4, null]);
      expect(isLikelyAscendingVector(v)).toBeFalsy();
    });

    it('decending', () => {
      expect(isLikelyAscendingVector(new ArrayVector([7, 6, null]))).toBeFalsy();
      expect(isLikelyAscendingVector(new ArrayVector([7, 8, 6]))).toBeFalsy();
    });

    it('ascending first/last', () => {
      expect(isLikelyAscendingVector(new ArrayVector([10, 20, 30, 5, 15, 7, 43, 29, 11]), 3)).toBeFalsy();
      expect(
        isLikelyAscendingVector(new ArrayVector([null, 10, 20, 30, 5, null, 15, 7, 43, 29, 11, null]), 3)
      ).toBeFalsy();
    });

    it('null stuffs', () => {
      expect(isLikelyAscendingVector(new ArrayVector([null, null, 1]), 3)).toBeTruthy();
      expect(isLikelyAscendingVector(new ArrayVector([1, null, null]), 3)).toBeTruthy();
      expect(isLikelyAscendingVector(new ArrayVector([null, null, null]), 3)).toBeTruthy();
      expect(isLikelyAscendingVector(new ArrayVector([null, 1, null]), 3)).toBeTruthy();
    });
  });

  describe('should perform a join on custom fields', () => {
    const tags = toDataFrame({
      refId: 'tags',
      fields: [
        { name: 'tags__time', type: FieldType.time, values: [100, 101, 200] },
        { name: 'tags__name', type: FieldType.string, values: ['v1.2', 'v1.2b', 'v1.3'] },
      ],
    });

    const releases = toDataFrame({
      refId: 'releases',
      fields: [
        { name: 'releases__time', type: FieldType.time, values: [150, 250] },
        { name: 'releases__tag', type: FieldType.string, values: ['v1.2', 'v1.3'] },
      ],
    });

    const features = toDataFrame({
      refId: 'features',
      fields: [
        { name: 'features__name', type: FieldType.string, values: ['A', 'B', 'C', 'D', 'E'] },
        { name: 'features__tag', type: FieldType.time, values: ['v1.2', 'v1.3', 'v1.2b', 'v1.3', 'v1.2'] },
      ],
    });

    it('should perform an outer join', () => {
      const out = joinDataFrames({
        frames: [tags, releases, features],
        fields: {
          tags: 'tags__name',
          releases: 'releases__tag',
          features: 'features__tag',
        },
      })!;

      expect(
        out.fields.map((f) => ({
          name: f.name,
          values: f.values.toArray(),
        }))
      ).toEqual([
        {
          name: 'tags__name',
          values: ['v1.2', 'v1.2b', 'v1.3'],
        },
        {
          name: 'tags__time',
          values: [100, 101, 200],
        },
        {
          name: 'releases__time',
          values: [150, undefined, 250],
        },
        {
          name: 'features__name',
          values: ['E', 'C', 'D'],
        },
      ]);
    });

    it('should perform an inner join', () => {
      const out = joinDataFrames({
        frames: [tags, releases, features],
        fields: {
          tags: 'tags__name',
          releases: 'releases__tag',
          features: 'features__tag',
        },
        mode: JoinMode.inner,
      })!;

      const mappedOut = out.fields.map((f) => ({
        name: f.name,
        values: f.values.toArray(),
      }));

      const expected = [
        {
          name: 'tags__name',
          values: ['v1.2', 'v1.3'],
        },
        {
          name: 'tags__time',
          values: [100, 200],
        },
        {
          name: 'releases__time',
          values: [150, 250],
        },
        {
          name: 'features__name',
          values: ['E', 'D'],
        },
      ];

      expect(JSON.stringify(mappedOut)).toEqual(JSON.stringify(expected));
    });
  });
});
