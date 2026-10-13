declare module 'polygon-clipping' {
  type Pair = [number, number]
  type Ring = Pair[]
  type Polygon = Ring[]
  type MultiPolygon = Polygon[]
  type Geom = Polygon | MultiPolygon
  interface Clipping {
    union(a: Geom, ...rest: Geom[]): MultiPolygon
    intersection(a: Geom, ...rest: Geom[]): MultiPolygon
    difference(a: Geom, ...rest: Geom[]): MultiPolygon
    xor(a: Geom, ...rest: Geom[]): MultiPolygon
  }
  const clipping: Clipping
  export default clipping
}
