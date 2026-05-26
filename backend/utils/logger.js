function format(level, message, meta) {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...(meta ? { meta } : {})
  };
  return JSON.stringify(payload);
}

module.exports = {
  info(message, meta) {
    console.log(format("info", message, meta));
  },
  error(message, meta) {
    console.error(format("error", message, meta));
  }
};