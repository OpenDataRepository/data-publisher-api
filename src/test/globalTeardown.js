module.exports = async () => {
  await global.replset.stop();
  delete global.replset;
}