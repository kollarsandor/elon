async function main() {
  log_default.info("Starting Grok-Computer server");
  try {
    if (process.argv.includes("--stdio")) {
      await startStdioMode();
    } else {
      await startServer();
    }
    log_default.info("Server started successfully");
    process.on("exit", (code) => {
      log_default.info(`Process exiting with code ${code}`);
    });
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (err2) {
    log_default.error("Error starting server", err2);
    process.exit(1);
  }
}
async function shutdown() {
  log_default.info("Shutting down server");
  try {
    await destroyAllSessions();
    log_default.info("Shutdown complete");
  } catch (err2) {
    log_default.error("Error during shutdown", err2);
  } finally {
    process.exit(0);
  }
}
main().catch((err2) => {
  log_default.error("Unhandled error in main", err2);
  process.exit(1);
});
export {
  main,
  shutdown
};
/*! Bundled license information:

object-assign/index.js:
  (*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  *)

vary/index.js:
  (*!
   * vary
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

depd/index.js:
  (*!
   * depd
   * Copyright(c) 2014-2018 Douglas Christopher Wilson
   * MIT Licensed
   *)

statuses/index.js:
statuses/index.js:
  (*!
   * statuses
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

toidentifier/index.js:
  (*!
   * toidentifier
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

http-errors/index.js:
  (*!
   * http-errors
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

ee-first/index.js:
  (*!
   * ee-first
   * Copyright(c) 2014 Jonathan Ong
   * MIT Licensed
   *)

on-finished/index.js:
  (*!
   * on-finished
   * Copyright(c) 2013 Jonathan Ong
   * Copyright(c) 2014 Douglas Christopher Wilson
   * MIT Licensed
   *)

bytes/index.js:
  (*!
   * bytes
   * Copyright(c) 2012-2014 TJ Holowaychuk
   * Copyright(c) 2015 Jed Watson
   * MIT Licensed
   *)

unpipe/index.js:
  (*!
   * unpipe
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

raw-body/index.js:
  (*!
   * raw-body
   * Copyright(c) 2013-2014 Jonathan Ong
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

body-parser/lib/read.js:
body-parser/lib/types/raw.js:
body-parser/lib/types/text.js:
body-parser/index.js:
  (*!
   * body-parser
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

content-type/index.js:
  (*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-db/index.js:
  (*!
   * mime-db
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

mime-types/index.js:
  (*!
   * mime-types
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

media-typer/index.js:
  (*!
   * media-typer
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

type-is/index.js:
  (*!
   * type-is
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

body-parser/lib/types/json.js:
body-parser/lib/types/urlencoded.js:
  (*!
   * body-parser
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

encodeurl/index.js:
  (*!
   * encodeurl
   * Copyright(c) 2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

escape-html/index.js:
  (*!
   * escape-html
   * Copyright(c) 2012-2013 TJ Holowaychuk
   * Copyright(c) 2015 Andreas Lubbe
   * Copyright(c) 2015 Tiancheng "Timothy" Gu
   * MIT Licensed
   *)

parseurl/index.js:
  (*!
   * parseurl
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

finalhandler/index.js:
  (*!
   * finalhandler
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

express/lib/view.js:
express/lib/application.js:
express/lib/request.js:
express/lib/express.js:
express/index.js:
  (*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

etag/index.js:
  (*!
   * etag
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

forwarded/index.js:
  (*!
   * forwarded
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

proxy-addr/index.js:
  (*!
   * proxy-addr
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

express/lib/utils.js:
express/lib/response.js:
  (*!
   * express
   * Copyright(c) 2009-2013 TJ Holowaychuk
   * Copyright(c) 2014-2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

router/lib/layer.js:
router/lib/route.js:
router/index.js:
  (*!
   * router
   * Copyright(c) 2013 Roman Shtylman
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

negotiator/index.js:
  (*!
   * negotiator
   * Copyright(c) 2012 Federico Romero
   * Copyright(c) 2012-2014 Isaac Z. Schlueter
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

accepts/index.js:
  (*!
   * accepts
   * Copyright(c) 2014 Jonathan Ong
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

fresh/index.js:
  (*!
   * fresh
   * Copyright(c) 2012 TJ Holowaychuk
   * Copyright(c) 2016-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

range-parser/index.js:
  (*!
   * range-parser
   * Copyright(c) 2012-2014 TJ Holowaychuk
   * Copyright(c) 2015-2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

safe-buffer/index.js:
  (*! safe-buffer. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> *)

content-disposition/index.js:
  (*!
   * content-disposition
   * Copyright(c) 2014-2017 Douglas Christopher Wilson
   * MIT Licensed
   *)

cookie/index.js:
  (*!
   * cookie
   * Copyright(c) 2012-2014 Roman Shtylman
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)

send/index.js:
  (*!
   * send
   * Copyright(c) 2012 TJ Holowaychuk
   * Copyright(c) 2014-2022 Douglas Christopher Wilson
   * MIT Licensed
   *)

serve-static/index.js:
  (*!
   * serve-static
   * Copyright(c) 2010 Sencha Inc.
   * Copyright(c) 2011 TJ Holowaychuk
   * Copyright(c) 2014-2016 Douglas Christopher Wilson
   * MIT Licensed
   *)

ieee754/index.js:
  (*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> *)

timm/lib/timm.js:
  (*!
   * Timm
   *
   * Immutability helpers with fast reads and acceptable writes.
   *
   * @copyright Guillermo Grau Panea 2016
   * @license MIT
   *)

image-q/dist/cjs/image-q.cjs:
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * cie94.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * ciede2000.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * cmetric.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * common.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * constants.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * ditherErrorDiffusionArray.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * euclidean.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * helper.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * hueStatistics.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * iq.ts - Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * lab2rgb.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * lab2xyz.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * manhattanNeuQuant.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * nearestColor.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * palette.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * pngQuant.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * point.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * pointContainer.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * rgb2hsl.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * rgb2lab.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * rgb2xyz.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * ssim.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * wuQuant.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * xyz2lab.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * xyz2rgb.ts - part of Image Quantization Library
   *)
  (**
   * @preserve
   * MIT License
   *
   * Copyright 2015-2018 Igor Bezkrovnyi
   *
   * Permission is hereby granted, free of charge, to any person obtaining a copy
   * of this software and associated documentation files (the "Software"), to
   * deal in the Software without restriction, including without limitation the
   * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
   * sell copies of the Software, and to permit persons to whom the Software is
   * furnished to do so, subject to the following conditions:
   *
   * The above copyright notice and this permission notice shall be included in
   * all copies or substantial portions of the Software.
   *
   * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
   * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
   * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
   * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
   * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
   * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
   * IN THE SOFTWARE.
   *
   * riemersma.ts - part of Image Quantization Library
   *)
  (**
   * @preserve TypeScript port:
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * colorHistogram.ts - part of Image Quantization Library
   *)
  (**
   * @preserve TypeScript port:
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * neuquant.ts - part of Image Quantization Library
   *)
  (**
   * @preserve TypeScript port:
   * Copyright 2015-2018 Igor Bezkrovnyi
   * All rights reserved. (MIT Licensed)
   *
   * rgbquant.ts - part of Image Quantization Library
   *)

sax/lib/sax.js:
  (*! http://mths.be/fromcodepoint v0.1.0 by @mathias *)

lodash-es/lodash.js:
  (**
   * @license
   * Lodash (Custom Build) <https://lodash.com/>
   * Build: `lodash modularize exports="es" -o ./`
   * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
   * Released under MIT license <https://lodash.com/license>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   *)
*/