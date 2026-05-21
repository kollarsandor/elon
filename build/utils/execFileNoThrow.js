import { execFile } from "child_process";
var MS_IN_SECOND = 1e3;
var SECONDS_IN_MINUTE = 60;
function execFileNoThrow(file, args, cwd, abortSignal, timeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND, preserveOutputOnError = true) {
  return new Promise((resolve8) => {
    try {
      execFile(file, args, {
        maxBuffer: 1e6,
        signal: abortSignal,
        timeout,
        cwd: cwd || process.cwd()
      }, (error, stdout, stderr) => {
        if (error) {
          if (preserveOutputOnError) {
            const errorCode = typeof error.code === "number" ? error.code : 1;
            resolve8({
              stdout: stdout || "",
              stderr: stderr || "",
              code: errorCode,
              error
            });
          } else {
            resolve8({ stdout: "", stderr: "", code: 1, error });
          }
        } else {
          resolve8({ stdout, stderr, code: 0 });
        }
      });
    } catch (error) {
      log.error(error);
      resolve8({ stdout: "", stderr: "", code: 1, error });
    }
  });
}