/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

declare module '*.css' {
  const content: Record<string, string>
  export default content
}
