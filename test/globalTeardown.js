module.exports = async function globalSetup() {
  await global.replset.stop();
  delete global.replset;
}