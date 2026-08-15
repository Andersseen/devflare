/**
 * The one part of `@org/deploy` that touches the DOM: turning what a directory
 * picker hands over into files the deploy client can read.
 *
 * Reading goes through `FileReader.readAsDataURL` rather than
 * `btoa(String.fromCharCode(...bytes))`. The obvious approach blows the call
 * stack the moment a file is more than a few hundred KB — spreading a
 * 25 MiB `Uint8Array` into `String.fromCharCode` is not a thing that works —
 * and chunking around that is both slower and more code than asking the browser
 * to do the encoding it already does natively.
 */

import type { DeployFile } from './deploy-client';

export function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read the file'));

    reader.onload = () => {
      const result = reader.result as string;
      // `data:<mime>;base64,<payload>` — everything after the first comma. An
      // empty file yields an empty payload, which is correct and not an error.
      resolve(result.slice(result.indexOf(',') + 1));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * `<input type="file" webkitdirectory>` sets `webkitRelativePath` to the path
 * within the chosen folder, including the folder's own name — which is exactly
 * the contract `planAssets` expects, so the root gets stripped there.
 */
export function toDeployFiles(files: ArrayLike<File>): DeployFile[] {
  return Array.from(files).map((file) => {
    return {
      // `webkitRelativePath` is standard on File and is an empty string when
      // the file did not come from a directory picker.
      path: file.webkitRelativePath || file.name,
      size: file.size,
      contentType: file.type,
      base64: () => readBase64(file),
      text: () => file.text(),
    };
  });
}
