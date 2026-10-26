import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://2smokinbarrels.com',
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
});
