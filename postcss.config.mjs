/*
 * Tailwind v4 through PostCSS.
 *
 * The Vite app used @tailwindcss/vite; Next has no Vite pipeline, so the PostCSS plugin is
 * the supported path. The @theme block in src/styles/globals.css is unchanged — the tokens
 * are the design system and none of them move.
 */
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
