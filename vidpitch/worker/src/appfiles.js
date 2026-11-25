// The website's recorder (/record) runs the extension's own files, served
// from /app/. They are bundled into the Worker as text, so the website and
// the extension can never drift apart. The 31 MB ffmpeg core is too big to
// bundle, so it lives in R2 under app/ (see README: "Upload the converter").
import recorderHtml from '../../extension/recorder.html';
import recorderCss from '../../extension/recorder.css';
import recorderJs from '../../extension/recorder.js';
import cameraJs from '../../extension/camera.js';
import previewJs from '../../extension/preview.js';
import convertJs from '../../extension/convert.js';
import mp4checkJs from '../../extension/mp4check.js';
import gifencJs from '../../extension/vendor/gifenc.esm.js';
import ffIndex from '../../extension/vendor/ffmpeg/index.js';
import ffClasses from '../../extension/vendor/ffmpeg/classes.js';
import ffConst from '../../extension/vendor/ffmpeg/const.js';
import ffErrors from '../../extension/vendor/ffmpeg/errors.js';
import ffTypes from '../../extension/vendor/ffmpeg/types.js';
import ffUtils from '../../extension/vendor/ffmpeg/utils.js';
import ffWorker from '../../extension/vendor/ffmpeg/worker.js';
import icon16 from '../../extension/icons/icon16.png';
import icon32 from '../../extension/icons/icon32.png';
import icon48 from '../../extension/icons/icon48.png';
import icon128 from '../../extension/icons/icon128.png';

const JS = 'text/javascript; charset=utf-8';
const PNG = 'image/png';

export const RECORDER_HTML = recorderHtml;

export const APP_FILES = {
  'recorder.css': [recorderCss, 'text/css; charset=utf-8'],
  'recorder.js': [recorderJs, JS],
  'camera.js': [cameraJs, JS],
  'preview.js': [previewJs, JS],
  'convert.js': [convertJs, JS],
  'mp4check.js': [mp4checkJs, JS],
  'vendor/gifenc.esm.js': [gifencJs, JS],
  'vendor/ffmpeg/index.js': [ffIndex, JS],
  'vendor/ffmpeg/classes.js': [ffClasses, JS],
  'vendor/ffmpeg/const.js': [ffConst, JS],
  'vendor/ffmpeg/errors.js': [ffErrors, JS],
  'vendor/ffmpeg/types.js': [ffTypes, JS],
  'vendor/ffmpeg/utils.js': [ffUtils, JS],
  'vendor/ffmpeg/worker.js': [ffWorker, JS],
  'icons/icon16.png': [icon16, PNG],
  'icons/icon32.png': [icon32, PNG],
  'icons/icon48.png': [icon48, PNG],
  'icons/icon128.png': [icon128, PNG],
};
