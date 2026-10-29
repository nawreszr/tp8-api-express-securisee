module.exports = (err, req, res, next) => {
  console.error(`[SERVER ERROR] ${err.message}`);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "INVALID_JSON" });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "PAYLOAD_TOO_LARGE" });
  }

  res.status(500).json({ error: "INTERNAL_ERROR" });
};
