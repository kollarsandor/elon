var NodeEnv;
(function(NodeEnv2) {
  NodeEnv2["Development"] = "development";
  NodeEnv2["Production"] = "production";
  NodeEnv2["Test"] = "test";
})(NodeEnv || (NodeEnv = {}));
function isNodeEnv(env3) {
  return env3 === NodeEnv.Development || env3 === NodeEnv.Production || env3 === NodeEnv.Test;
}
var nodeEnv = getVar(EnvVar.NodeEnv)?.toLowerCase() ?? NodeEnv.Development;
if (!isNodeEnv(nodeEnv))
  throw new Error("Invalid Node Env!");
var config = {
  nodeEnv,
  logLevel: getVar(EnvVar.LogLevel) ?? "info",
  port: getVar(EnvVar.Port) ?? (nodeEnv === NodeEnv.Test ? 2424 : 4242)
};
var config_default = config;