export default defineConfig({
  site: 'https://2smokinbarrels.com',
  image: {
    // optional: force modern formats
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
  },
});
