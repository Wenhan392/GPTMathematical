export const defaultAppDownloadPath = "/downloads/GPT-Mathematical-Windows.exe";

export function getAppDownloadUrl(requestUrl?: string): string {
  if (process.env.APP_DOWNLOAD_URL) {
    return process.env.APP_DOWNLOAD_URL;
  }

  if (requestUrl) {
    return new URL(defaultAppDownloadPath, requestUrl).toString();
  }

  return defaultAppDownloadPath;
}
