///// STARTUP AND INSTALLATION LOGIC /////
chrome.runtime.onStartup.addListener(() => {
  validateFavorites();
});
chrome.runtime.onInstalled.addListener(() => {
  initializeUuidMappings();
  initializeFavorites();
  initializeSelectedFolder();
  validateFavorites();
});
////// MESSAGE HANDLING //////
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  (async (request, sender, sendResponse) => {
  try {
      switch (request.action) {
          case "switchBookmarks":
              const targetFolderId = request.folderId;
              console.log("Message received: switchBookmarks to folderId:", targetFolderId);
              await switchBookmarks(targetFolderId, sendResponse);
              return true;
          case "switchBookmarksFromFavorite":
              const uuid = await getUuidFromFolderId(request.folderId);
              if (uuid) {
                  await switchBookmarksFromFavorite(uuid, sendResponse);
              } else {
                  sendResponse({ success: false, error: "UUID not found for folderId." });
              }
              return true;
          case "setFavorites":
            try {
              await setFavoritesFromPopup(request.name, request.index, request.folderId, sendResponse);
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
            break;
          case "removeFavorite":
              const removeUuid = await getUuidFromFolderId(request.folderId);
              console.log("removeStart: ");
              if (removeUuid) {
                try {
                    await removeFavorite(removeUuid);
                    console.log("removeSendResponse: ");
                    sendResponse({ success: true, message: "removeFavorite completed" });
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
              } else {
                  sendResponse({ success: false, error: "UUID not found for folderId." });
                  console.warn(`UUID not found for folderId: ${request.folderId}`);
              }
              break;
          default:
              console.warn("Unknown message action:", request.action);
      }
  } catch (error) {
      console.error("Error handling message:", error);
      if (sendResponse) {
          sendResponse({ success: false, error: "An error occurred." });
      }
  }
  })(request, sender, sendResponse); // Invoke the async function with arguments
  return true; // Indicate async response for cases that use sendResponse
});
///// STORAGE EVENT LISTENERS /////
chrome.storage.onChanged.addListener((changes, areaName, sender) => {
  if (areaName === "sync" && sender && sender.id !== chrome.runtime.id) {
    try {
      if (changes.favorites) {
        initializeUuidMappings();
        synchronizeFavorites();
      }
      if (changes.selectedFolder) {
        initializeUuidMappings();
        synchronizeSelectedFolder();
      }
    } catch (error) {
        console.error("Error handling sync storage change:", error);
    }
  }
});
///// BOOKMARK EVENT LISTENERS /////
chrome.bookmarks.onChanged.addListener((folderId, changeInfo) => {
  chrome.storage.local.get({ uuidMappings: {} }, (localResult) => {
    const uuidMappings = localResult.uuidMappings;
    const uuid = Object.keys(uuidMappings).find(
      (key) => uuidMappings[key] === folderId
    );
    if (uuid) {
      chrome.storage.sync.get({ favorites: [] }, (syncResult) => {
        const favorites = syncResult.favorites.map((fav) => {
          if (fav.uuid === uuid) {
            fav.name = changeInfo.title;
          }
          return fav;
        });
        chrome.storage.sync.set({ favorites });
      });
    }
  });
});
chrome.bookmarks.onRemoved.addListener((folderId, removeInfo) => {
  chrome.storage.local.get({ uuidMappings: {} }, (localResult) => {
    let uuidMappings = localResult.uuidMappings;
    const uuid = Object.keys(uuidMappings).find(
      (key) => uuidMappings[key] === folderId
    );
    if (uuid) {
      delete uuidMappings[uuid];
      chrome.storage.local.set({ uuidMappings: uuidMappings });
      chrome.storage.sync.get({ favorites: [] }, (syncResult) => {
        let favorites = syncResult.favorites;
        favorites = favorites.filter((fav) => fav.uuid !== uuid);
        chrome.storage.sync.set({ favorites: favorites });
      });
    }
  });
});

///// BOOKMARK SWITCHING /////
async function switchBookmarksFromFavorite(uuid, sendResponse) {
  try {
      const localResult = await chrome.storage.local.get({ uuidMappings: {} });
      const uuidMappings = localResult.uuidMappings;
      let folderId = uuidMappings[uuid];

      if (!folderId) {
          const syncResult = await chrome.storage.sync.get({ favorites: [] });
          const favorite = syncResult.favorites.find(fav => fav.uuid === uuid);

          if (favorite) {
              const children = await new Promise((resolve) => {
                  chrome.bookmarks.getChildren('2', resolve);
              });
              const foundFolder = children.find(child => child.title === favorite.name && child.index === favorite.index);

              if (foundFolder) {
                  folderId = foundFolder.id;
                  await updateUuidMapping(uuid, folderId); // Update mappings in background
              } else {
                  sendResponse({ success: false, error: 'Folder not found' });
                  return;
              }
          }
      }

      if (folderId) {
          await switchBookmarks(folderId, sendResponse); // Use your existing switchBookmarks logic
          await sendMessageToPopup({action: 'setActiveFavorite', uuid: uuid});
      } else {
          sendResponse({ success: false, error: 'Folder ID not found' });
      }
  } catch (error) {
      console.error("Error in switchBookmarksFromFavorite:", error);
      sendResponse({ success: false, error: "An error occurred." });
  }
}
async function switchBookmarks(targetFolderId, sendResponse) {
  console.log("switchBookmarks function started, targetFolderId:", targetFolderId);

  try {
      const currentFolderId = await ensureCurrentFolder();
      const [bookmarkBarBookmarks, currentFolderBookmarks] = await fetchBookmarks(currentFolderId);

      if (currentFolderId) {
          await updateBackupFolder(currentFolderId, bookmarkBarBookmarks, currentFolderBookmarks);
      }

      await performSwitchAndRespond(targetFolderId, sendResponse);

  } catch (error) {
      console.error("Error during bookmark switch:", error);
      sendResponse({ success: false, error: "Error during bookmark switch." });
  }
}
async function updateBackupFolder(currentFolderId, bookmarkBarBookmarks, currentFolderBookmarks) {
  try {
      await updateFolderBookmarks(currentFolderId, bookmarkBarBookmarks, currentFolderBookmarks);
      console.log("updateFolderBookmarks completed successfully.");
  } catch (error) {
      console.error("Error in updateFolderBookmarks:", error);
      throw error; // Propagate the error
  }
}
async function performSwitchAndRespond(targetFolderId, sendResponse) {
  try {
      await performSwitch(targetFolderId, sendResponse);
      sendResponse({ success: true });
  } catch (error) {
      console.error("Error during performSwitch:", error);
      sendResponse({ success: false, error: "Error during bookmark switch." });
  }
}
async function performSwitch(targetFolderId, sendResponse) {
  console.log("performSwitch started, targetFolderId:", targetFolderId);
  try {
    const targetFolderNode = await new Promise((resolve) => {
      chrome.bookmarks.get(targetFolderId, (node) => {
          if (chrome.runtime.lastError) {
              console.error(
                  "Error getting bookmark for targetFolderId:",
                  targetFolderId,
                  chrome.runtime.lastError
              );
              resolve(null); // Resolve with null to handle the error
          } else {
              resolve(node);
          }
      });
  });

    if (!targetFolderNode) {
      console.error("Target folder not found:", targetFolderId);
      sendResponse({ success: false, error: "Target folder not found." });
      return;
    }
    const folderName = targetFolderNode[0].title;
    const index = targetFolderNode[0].index;

    await clearBookmarks("1");
    await copyBookmarks(targetFolderId, "1");
    await setSelectedFolder(targetFolderId, folderName, index); 

    console.log("Bookmarks switched successfully to folder ID:", targetFolderId);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error during bookmark switch in performSwitch:", error);
    console.error(error);
    sendResponse({
      success: false,
      error: "Error during bookmark switch.",
    });
  }
}

///// BOOKMARK MANIPULATION /////
function clearBookmarks(folderId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(folderId, (children) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }
      console.log(
        `clearBookmarks - Children of folderId: ${folderId} are:`,
        children
      );
      if (!children || children.length === 0) {
        console.log("   - Folder is already empty.");
        resolve();
        return;
      }
      let removalPromises = children.map((child) => {
        return new Promise((resolveRemove) => {
          chrome.bookmarks.removeTree(child.id, () => {
            resolveRemove();
          });
        });
      });
      Promise.all(removalPromises).then(resolve).catch(reject);
    });
  });
}
function copyBookmarks(fromFolderId, toFolderId) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.getChildren(fromFolderId, (bookmarks) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error creating target folder:",
          chrome.runtime.lastError
        );
        return;
      }
      console.log(
        `copyBookmarks - Bookmarks from folderId: ${fromFolderId} are:`,
        bookmarks
      );
      let createPromises = bookmarks.map((bookmark) => {
        return new Promise((resolveCreate) => {
          createBookmark(toFolderId, bookmark, resolveCreate);
        });
      });
      Promise.all(createPromises).then(resolve).catch(reject);
    });
  });
}
function createBookmark(parentId, bookmark, resolve) {
  let bookmarkProperties = {
    parentId: parentId,
    title: bookmark.title,
  };

  if (bookmark.url) {
    // It's a bookmark
    bookmarkProperties.url = bookmark.url;
    chrome.bookmarks.create(bookmarkProperties, (createdBookmark) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error creating bookmark:",
          chrome.runtime.lastError,
          bookmark
        );
        resolve(null); // Indicate failure
        return;
      }
      resolve(createdBookmark);
    });
  } else {
    // It's a folder
    chrome.bookmarks.create(bookmarkProperties, (createdFolder) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error creating folder:",
          chrome.runtime.lastError,
          bookmark
        );
        resolve(null); // Indicate failure
        return;
      }
      // Recursively copy children
      chrome.bookmarks.getChildren(bookmark.id, (children) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error getting children of folder:",
            chrome.runtime.lastError,
            bookmark
          );
          resolve(null); // Indicate failure
          return;
        }
        if (children && children.length > 0) {
          let childPromises = children.map((childBookmark) => {
            return new Promise((resolveChild) => {
              createBookmark(createdFolder.id, childBookmark, resolveChild);
            });
          });
          Promise.all(childPromises)
            .then((createdChildren) => {
              if (createdChildren.some((child) => child === null)) {
                console.error(
                  "Some child bookmarks/folders failed to create in folder:",
                  bookmark
                );
                resolve(null); // Indicate failure
              } else {
                resolve(createdFolder);
              }
            })
            .catch((error) => {
              console.error(
                "Error creating children in folder:",
                error,
                bookmark
              );
              resolve(null); // Indicate failure
            });
        } else {
          resolve(createdFolder); // Resolve when folder is created (no children)
        }
      });
    });
  }
}
async function getBookmarksInFolder(folderId) {
  return new Promise(async (resolve, reject) => {
      let bookmarks = [];

      async function traverseBookmarks(node) {
          if (node.url) {
              // It's a bookmark
              bookmarks.push({
                  id: node.id,
                  url: node.url,
                  title: node.title,
              });
          } else {
              // It's a folder
              try {
                  const children = await new Promise((resolveChildren) => {
                      chrome.bookmarks.getChildren(node.id, resolveChildren);
                  });
                  if (children && children.length > 0) {
                      for (const child of children) {
                          await traverseBookmarks(child); // Recursively traverse children
                      }
                  }
              } catch (error) {
                  console.warn("Bookmark not found:", node.id, error.message);
              }
          }
      }

      try {
          const children = await new Promise((resolveChildren) => {
              chrome.bookmarks.getChildren(folderId, resolveChildren);
          });
          if (children) {
              for (const child of children) {
                  await traverseBookmarks(child);
              }
          }
          resolve(bookmarks);
      } catch (error) {
          reject(error);
      }
  });
}
function updateFolderBookmarks(
  folderId,
  bookmarkBarBookmarks,
  currentFolderBookmarks
) {
  return new Promise(async (resolve, reject) => {
    console.log("updateFolderBookmarks called for folderId:", folderId);
    console.log("   - Bookmark Bar Bookmarks:", bookmarkBarBookmarks);
    console.log(
      "   - Current Folder Bookmarks (before update):",
      currentFolderBookmarks
    );

    try {
      await clearBookmarks(folderId);
      console.log("   - Folder cleared:", folderId);
      await copyBookmarks("1", folderId);
      console.log("   - Bookmarks copied to folder:", folderId);
      resolve();
    } catch (error) {
      console.error("Error during updateFolderBookmarks:", error);
      console.error(error);
      reject(error);
    }
  });
}
function createNewBookmarkFolder() {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const dateTimeString =
      now.getFullYear().toString() +
      ("0" + (now.getMonth() + 1)).slice(-2) +
      ("0" + now.getDate()).slice(-2) +
      ("0" + now.getHours()).slice(-2) +
      ("0" + now.getMinutes()).slice(-2) +
      ("0" + now.getSeconds()).slice(-2);

    chrome.bookmarks.create(
      {
        parentId: "2", // '2' is "Other Bookmarks" - you can change this
        title: dateTimeString,
      },
      (newFolder) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(newFolder.id); // Resolve with the new folder ID
        }
      }
    );
  });
}

////// UUID MAPPINGS //////
async function initializeUuidMappings() {
  try {
      let uuidMappings = {}; // Initialize uuidMappings

      const syncResult = await chrome.storage.sync.get({ favorites: [], selectedFolder: null });
      const syncFavorites = syncResult.favorites;
      const selectedFolder = syncResult.selectedFolder;

      // Map favorites
      for (const favorite of syncFavorites) {
          if (!uuidMappings[favorite.uuid]) {
              const folderId = await findFolderId(favorite.name, favorite.index);
              if (folderId) {
                  uuidMappings[favorite.uuid] = folderId;
              }
          }
      }

        // Map selectedFolder (if exists)
      if (selectedFolder && !uuidMappings[selectedFolder.uuid]) {
        const folderId = await findFolderId(selectedFolder.name, selectedFolder.index);
        if (folderId) {
            // Skip adding mapping if folderId is already mapped
            const existingUuid = Object.keys(uuidMappings).find(key => uuidMappings[key] === folderId);
            if (!existingUuid) {
                uuidMappings[selectedFolder.uuid] = folderId;
            }
        }
      }

      await chrome.storage.local.set({ uuidMappings: uuidMappings });
  } catch (error) {
      console.error("Error initializing uuidMappings:", error);
  }
}
async function updateUuidMapping(uuid, folderId) {
  try {
      const folderExists = await checkFolderExists(folderId);
      if (folderExists) {
          const localResult = await chrome.storage.local.get({ uuidMappings: {} });
          const uuidMappings = localResult.uuidMappings;
          uuidMappings[uuid] = folderId;
          await chrome.storage.local.set({ uuidMappings: uuidMappings });
      } else {
          console.warn(`Folder with ID ${folderId} does not exist. Removing uuidMapping for ${uuid}.`);
          await removeUuidMapping(uuid);
      }
  } catch (error) {
      console.error("Error updating uuidMapping:", error);
  }
}
async function checkFolderExists(folderId) {
  return new Promise((resolve) => {
      chrome.bookmarks.get(folderId, (folder) => {
          resolve(!!folder && folder.length > 0);
      });
  });
}
async function removeUuidMapping(uuid) {
  try {
      const localResult = await chrome.storage.local.get({ uuidMappings: {}, selectedFolder: null, favorites: [] });
      const uuidMappings = localResult.uuidMappings;

      if (!uuidMappings[uuid]) return; // Check if uuid exists in uuidMappings

      const selectedFolder = localResult.selectedFolder;
      const favorites = localResult.favorites;

      // Check if uuid is in selectedFolder or uuid is in favorites
      if (selectedFolder && selectedFolder.uuid === uuid || favorites.some(fav => fav.uuid === uuid)) return;

      // Remove uuidMapping
      delete uuidMappings[uuid];
      await chrome.storage.local.set({ uuidMappings: uuidMappings });

  } catch (error) {
      console.error("Error removing uuidMapping:", error);
  }
}
async function validateExistingUuidMappings(uuidMappings) {
  for (const uuid in uuidMappings) {
      const folderId = uuidMappings[uuid];
      const folderExists = await checkFolderExists(folderId);
      if (!folderExists) {
          console.warn(`Folder with ID ${folderId} does not exist. Removing uuidMapping for ${uuid}.`);
          delete uuidMappings[uuid];
      }
  }
  await chrome.storage.local.set({ uuidMappings: uuidMappings });
}

////// FAVORITES HANDLING //////
async function initializeFavorites() {
  try {
      const syncResult = await chrome.storage.sync.get({ favorites: [] });
      const syncFavorites = syncResult.favorites;

      if (syncFavorites && syncFavorites.length > 0) {
          const localFavorites = [];
          const folderIds = new Set(); // To track seen folderIds

          for (const favorite of syncFavorites) {
              const folderId = await getFolderIdFromMappings(favorite.uuid);
              if (folderId && !folderIds.has(folderId)) { // Check for duplicates
                  localFavorites.push({ uuid: favorite.uuid, id: folderId });
                  folderIds.add(folderId); // Add folderId to the set
              } else if (folderId){
                  console.warn(`Duplicate or invalid Folder ID ${folderId} for UUID ${favorite.uuid}.`);
              } else {
                  console.warn(`Folder ID not found for UUID ${favorite.uuid}.`);
              }
          }

          await chrome.storage.local.set({ favorites: localFavorites });
      }
  } catch (error) {
      console.error("Error initializing favorites:", error);
  }
}
async function setFavoritesFromPopup(name, index, folderId, sendResponse) {
  try {
      const uuid = await getUuidFromFolderId(folderId);
      const favorites = await getSyncFavorites();
      const localFavorites = await getLocalFavorites();

      const isFavorited = favorites.some(fav => fav.uuid === uuid);

      if (isFavorited) {
          await removeFavorite(uuid);
          return;
      }

      // Check for duplicates before adding
      const folderIdExists = localFavorites.some(fav => fav.id === folderId);
      if (!folderIdExists) {
          favorites.push({ uuid: uuid, name: name, index: index });
          localFavorites.push({ uuid: uuid, id: folderId });
          await updateFavoriteStorage(localFavorites, favorites);
          sendResponse({ success: true, message: "Favorites updated successfully." });
      } else {
          sendResponse({ success: false, error: "Folder ID already exists." });
      }

  } catch (error) {
      console.error("Error setting favorites:", error);
      sendResponse({ success: false, error: "Error setting favorites." });
  }
}
async function removeFavorite(uuid) {
  try {
      const syncFavorites = await getSyncFavorites();
      const localFavorites = await getLocalFavorites();

      const newSyncFavorites = syncFavorites.filter(fav => fav.uuid !== uuid);
      const newLocalFavorites = localFavorites.filter(fav => fav.uuid !== uuid);

      await updateFavoriteStorage(newLocalFavorites, newSyncFavorites);
      await removeUuidMapping(uuid);
  } catch (error) {
    
    console.error("Error removing favorite:", error);
  }
}
async function setFavorites(favorites) {
  try {
      const localFavorites = [];

      for (const favorite of favorites) {
          const folderId = await getFolderIdFromMappings(favorite.uuid); // Retrieve folderId using uuidMappings
          if (folderId) {
              localFavorites.push({ uuid: favorite.uuid, id: folderId });
          } else {
              console.warn(`Folder ID not found for UUID ${favorite.uuid}.`);
          }
      }

      await updateFavoriteStorage(localFavorites, favorites);

  } catch (error) {
      console.error("Error setting favorites:", error);
  }
}
async function validateFavorites() {
  try {
    const syncFavorites = await getSyncFavorites();
      const localFavorites = await getLocalFavorites();
      const validSyncFavorites = await filterValidSyncFavorites(syncFavorites, localFavorites);

      if (validSyncFavorites.length !== syncFavorites.length) {
          const validLocalFavorites = filterValidLocalFavorites(localFavorites, validSyncFavorites);
          await updateFavoriteStorage(validLocalFavorites, validSyncFavorites);
      }
  } catch (error) {
      console.error("Error validating favorites:", error);
  }
}
async function getSyncFavorites() {
  return new Promise((resolve) => {
      chrome.storage.sync.get({ favorites: [] }, (result) => {
          resolve(result.favorites);
      });
  });
}
async function getLocalFavorites() {
  return new Promise((resolve) => {
      chrome.storage.local.get({ favorites: [] }, (result) => {
          resolve(result.favorites);
      });
  });
}
async function filterValidSyncFavorites(syncFavorites, localFavorites) {
  return new Promise((resolve) => {
      chrome.bookmarks.getChildren("2", (children) => {
          const validFavorites = syncFavorites.filter((fav) => {
              const localFavorite = localFavorites.find(localFav => localFav.uuid === fav.uuid);
              if (localFavorite) {
                  const foundChild = children.find(child => child.id === localFavorite.id);
                  return !!foundChild;
              }
              return false;
          });
          resolve(validFavorites);
      });
  });
}
function filterValidLocalFavorites(localFavorites, validSyncFavorites) {
  return localFavorites.filter((fav) => {
      return validSyncFavorites.some(validFav => validFav.uuid === fav.uuid);
  });
}
async function updateFavoriteStorage(validLocalFavorites, validSyncFavorites) {
  await Promise.all([
      chrome.storage.local.set({ favorites: validLocalFavorites }),
      chrome.storage.sync.set({ favorites: validSyncFavorites })
  ]);
}
async function synchronizeFavorites() {
  try {
      const { syncFavorites } = await chrome.storage.sync.get({ favorites: [] });
      const { localFavorites } = await chrome.storage.local.get({ favorites: [] });

      if (syncFavorites && Array.isArray(syncFavorites)) {
        // Remove extra favorites first
        let updatedLocalFavorites = localFavorites.filter(localFav =>
            syncFavorites.some(syncFav => syncFav.uuid === localFav.uuid)
        );

        // Add missing favorites
        for (const favorite of syncFavorites) {
            const { name, index, uuid: syncUuid } = favorite;
            if (!updatedLocalFavorites.some(fav => fav.uuid === syncUuid)) {
                const folderId = await findFolderId(name, index);
                if (folderId) {
                    updatedLocalFavorites.push({ uuid: syncUuid, id: folderId });
                } else {
                    console.warn(`Folder not found for favorite: ${name}, ${index}`);
                }
            }
        }

        await chrome.storage.local.set({ favorites: updatedLocalFavorites });
      } else {
          // If syncFavorites is empty, clear localFavorites
          await chrome.storage.local.set({ favorites: [] });
      }
  } catch (error) {
      console.error("Error synchronizing favorites:", error);
  }
}

////// SELECTED FOLDER HANDLING //////
async function initializeSelectedFolder() {
  try {
      const { selectedFolder: syncSelectedFolder, favorites: syncFavorites } = await chrome.storage.sync.get({
          selectedFolder: null,
          favorites: []
      });

      if (!syncSelectedFolder || !syncSelectedFolder.uuid) {
          return; // No selected folder to initialize
      }

      const { uuid: uuid, name: selectedName, index: selectedIndex } = syncSelectedFolder;
      const { uuidMappings } = await chrome.storage.local.get({ uuidMappings: {} });
      const folderId = uuidMappings[uuid];

      if (!folderId) {
          console.warn(`Folder ID not found for UUID ${uuid}.`);
          return;
      }

      const existingUuid = Object.keys(uuidMappings).find(key => uuidMappings[key] === folderId);

      if (!existingUuid || existingUuid === uuid) {
          // No conflict or same UUID, set local selected folder
          await updateLocalSelectedFolder(uuid, folderId);
          return;
      }

      // Conflict: Check if existingUuid is in favorites and matches
      const matchingFavorite = syncFavorites.find(fav => fav.uuid === existingUuid);

      if (matchingFavorite && matchingFavorite.name === selectedName && matchingFavorite.index === selectedIndex) {
          // Update sync and local storage with the existing UUID
          await updateSelectedFolderStorage(existingUuid, folderId, selectedName, selectedIndex);
      } else {
          console.warn(`Folder ID ${folderId} is mapped to a different UUID (${existingUuid}) with mismatched name/index, but not in favorites.`);
      }
  } catch (error) {
      console.error("Error initializing selected folder:", error);
  }
}
async function setSelectedFolder(folderId, folderName, folderIndex) {
  try {
      const uuid = await getUuidFromFolderId(folderId);
      await updateSelectedFolderStorage(uuid, folderId, folderName, folderIndex);
  } catch (error) {
      console.error("Error setting selected folder:", error);
  }
}
async function updateSelectedFolderStorage(uuid, folderId, folderName, folderIndex) {
  try {
      await updateLocalSelectedFolder(uuid, folderId); // Update local storage and send message

      // Set selectedFolder data in sync storage
      const syncSelectedFolder = { uuid: uuid, name: folderName, index: folderIndex };
      await chrome.storage.sync.set({ selectedFolder: syncSelectedFolder });

  } catch (error) {
      console.error("Error updating selected folder storage:", error);
      throw error; // Re-throw the error to be handled by the caller
  }
}
async function updateLocalSelectedFolder(uuid, folderId) {
  try {
      const localSelectedFolder = { uuid: uuid, id: folderId };
      await chrome.storage.local.set({ selectedFolder: localSelectedFolder });
  } catch (error) {
      console.error("Error updating local selected folder:", error);
      throw error; // Re-throw the error to be handled by the caller
  }
}
async function synchronizeSelectedFolder() {
  try {
      const { selectedFolder } = await chrome.storage.sync.get({ selectedFolder: null });
      const { localSelectedFolder } = await chrome.storage.local.get({ selectedFolder: null });
      if(!selectedFolder) {
        return;
      }
      if (!localSelectedFolder || selectedFolder.uuid !== localSelectedFolder.uuid) {
          const { name, index, uuid } = selectedFolder;
          const folderId = await getFolderIdFromMappings(uuid);
          if (!folderId) {
              folderId = await findFolderId(name, index);
              if (!folderId) {
                console.warn(`Folder not found for selected folder: ${name}, ${index}`);
                return;
            }
          }
          await updateLocalSelectedFolder(uuid, folderId);
      }
  } catch (error) {
      console.error("Error synchronizing selected folder:", error);
  }
}

///// UTILITY FUNCTIONS /////
async function isValidBookmarkId(id) {
  return new Promise((resolve) => {
    chrome.bookmarks.get(id, (node) => {
      if (chrome.runtime.lastError) {
        // Log the error for debugging purposes
        // console.warn("Error checking bookmark ID:", id, chrome.runtime.lastError.message);
        resolve(false); // Resolve with false in case of an error
        return;
      }
      resolve(!!node); // Resolve with true if node exists, false otherwise
    });
  });
}
async function sendMessageToPopup(message) {
  try {
      chrome.runtime.sendMessage(message);
      if (chrome.runtime.lastError) {
          console.error("Error sending message to popup:", chrome.runtime.lastError.message);
      } else {
          console.log("Message sent successfully to popup:", message);
      }
  } catch (error) {
      console.error("Error sending message to popup:", error);
  }
}
async function getUuidFromFolderId(folderId) {
  try {
      const localResult = await chrome.storage.local.get({ uuidMappings: {} });
      const uuidMappings = localResult.uuidMappings;
      let uuid = Object.keys(uuidMappings).find(key => uuidMappings[key] === folderId);

      if (!uuid) {
          uuid = await generateUniqueUuid(); // Generate new uuid if needed
          await updateUuidMapping(uuid, folderId); // Update the mapping
      }

      return uuid;
  } catch (error) {
      console.error("Error retrieving/generating uuid:", error);
      return null; // Return null in case of error
  }
}
async function getFolderIdFromMappings(uuid) {
  const localResult = await chrome.storage.local.get({ uuidMappings: {} });
  const uuidMappings = localResult.uuidMappings;
  return uuidMappings[uuid];
}
async function generateUniqueUuid() {
  let uuid;
  let isUnique = false;
  while (!isUnique) {
      uuid = crypto.randomUUID();
      const favorites = await getSyncFavorites();
      isUnique = !favorites.some(fav => fav.uuid === uuid);
  }
  return uuid;
}
async function ensureCurrentFolder() {
  return new Promise((resolve, reject) => {
      chrome.storage.local.get(["selectedFolder"], async function (result) {
          let currentFolder = result.selectedFolder;
          let currentFolderId = currentFolder ? currentFolder.id : null;
          const bookmarkBarBookmarks = await new Promise((resolve) => {
              chrome.bookmarks.getChildren("1", resolve);
          });

          if ((!currentFolderId || !(await isValidBookmarkId(currentFolderId))) && bookmarkBarBookmarks && bookmarkBarBookmarks.length > 0) {
              try {
                  currentFolderId = await createNewBookmarkFolder();
                  if (!currentFolderId) {
                      reject("Error creating previous folder.");
                      return;
                  }
              } catch (error) {
                  reject(error);
                  return;
              }
          }
          resolve(currentFolderId);
      });
  });
}
async function fetchBookmarks(currentFolderId) {
  return Promise.all([
      getBookmarksInFolder("1"),
      currentFolderId ? getBookmarksInFolder(currentFolderId) : Promise.resolve([]),
  ]);
}
async function findFolderId(name, index) {
  return new Promise((resolve) => {
      chrome.bookmarks.getChildren("2", (children) => {
          const foundFolder = children.find(child => child.title === name && child.index === index);
          resolve(foundFolder ? foundFolder.id : null);
      });
  });
}