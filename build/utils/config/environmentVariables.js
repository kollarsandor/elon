var EnvVar;
(function(EnvVar2) {
  EnvVar2["Port"] = "PORT";
  EnvVar2["LogLevel"] = "LOG_LEVEL";
  EnvVar2["NodeEnv"] = "NODE_ENV";
})(EnvVar || (EnvVar = {}));
function getVar(environmentVariable) {
  return process.env[environmentVariable];
}