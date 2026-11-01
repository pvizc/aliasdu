const existingBrowser = globalThis.browser;
const chrome = globalThis.chrome;

const promisify = (fn) => {
  return (...args) =>
    new Promise((resolve, reject) => {
      try {
        fn(...args, (result) => {
          const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            reject(new Error(lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
};

let browser = existingBrowser;

if (!browser || !browser.storage?.local?.get) {
  const storageLocal = chrome?.storage?.local;

  const storage = {
    local: {
      get: storageLocal ? promisify(storageLocal.get.bind(storageLocal)) : async () => ({}),
      set: storageLocal ? promisify(storageLocal.set.bind(storageLocal)) : async () => {},
      remove: storageLocal ? promisify(storageLocal.remove.bind(storageLocal)) : async () => {},
      clear: storageLocal ? promisify(storageLocal.clear.bind(storageLocal)) : async () => {},
      getBytesInUse: storageLocal?.getBytesInUse
        ? promisify(storageLocal.getBytesInUse.bind(storageLocal))
        : async () => 0,
    },
  };

  const permissionsApi = chrome?.permissions;

  const permissions = {
    contains: permissionsApi
      ? promisify(permissionsApi.contains.bind(permissionsApi))
      : async () => true,
    request: permissionsApi
      ? promisify(permissionsApi.request.bind(permissionsApi))
      : async () => true,
  };

  browser = chrome ? { ...chrome, storage, permissions } : { storage, permissions };
}

export default browser;
