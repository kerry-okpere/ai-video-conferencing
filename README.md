# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Development — Chrome flags for WebGPU and the Translation API

To run this project in development with WebGPU-based features (and the in-browser Translation API) enabled in Chrome, enable the following experimental flags and then restart the browser:

- Open chrome://flags/#enable-webgpu-developer-features and set it to "Enabled".
- Open chrome://flags/#translation-api and enable it (if available).

These flags are experimental and may only be available in certain Chrome channels (for example, Canary or Dev). Enable them only for local development and testing.
