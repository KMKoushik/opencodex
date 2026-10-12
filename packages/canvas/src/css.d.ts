// The runtime bundles styles.css as text (esbuild's text loader).
declare module '*.css' {
  const text: string;
  export default text;
}
