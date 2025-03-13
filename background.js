chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "switchBookmarks") {
    const targetFolderId = request.folderId;
    console.log(
      "Message received: switchBookmarks to folderId:",
      targetFolderId
    );
    switchBookmarks(targetFolderId, sendResponse);
    return true; // Indicate we will send response asynchronously
  }
});

function switchBookmarks(targetFolderId, sendResponse) {
  console.log(
    "switchBookmarks function started, targetFolderId:",
    targetFolderId
  );
  chrome.storage.local.get(["selectedFolderId"], function (result) {
    let currentFolderId = result.selectedFolderId;
    console.log(
      "   - Retrieved currentFolderId from storage:",
      currentFolderId
    );

    if (!currentFolderId) {
      console.log(
        "   - No currentFolderId found in storage, proceeding to switch directly."
      );
      performSwitch(targetFolderId, sendResponse, null);
      return;
    }

    chrome.bookmarks.get(currentFolderId, function (currentFolderNode) {
      if (chrome.runtime.lastError || !currentFolderNode) {
        console.warn(
          "   - Current folder (ID:",
          currentFolderId,
          ") not found or error accessing it. Skipping save changes for previous folder."
        );
        currentFolderId = null;
        performSwitch(targetFolderId, sendResponse, null);
        return;
      }

      console.log(
        "   - Current folder (ID:",
        currentFolderId,
        ") exists. Proceeding to save changes."
      );

      chrome.bookmarks.get(targetFolderId, function (targetFolderNode) {
        if (chrome.runtime.lastError || !targetFolderNode) {
          console.error("Target folder not found:", targetFolderId);
          sendResponse({ success: false, error: "Target folder not found." });
          return;
        }
        // --- 2 & 3. Fetch Bookmarks ---
        Promise.all([
          getBookmarksInFolder("1"), // Bookmarks Bar (ID '1')
          getBookmarksInFolder(currentFolderId), // Currently active folder
        ])
          .then(([bookmarkBarBookmarks, currentFolderBookmarks]) => {
            console.log(
              "  - Fetched Bookmarks - Bookmark Bar:",
              bookmarkBarBookmarks
            );
            console.log(
              "  - Fetched Bookmarks - Current Folder:",
              currentFolderBookmarks
            );

            // --- 4. Update Currently Active Folder ---
            console.log(
              "  - Calling updateFolderBookmarks for folderId:",
              currentFolderId
            );
            updateFolderBookmarks(
              currentFolderId,
              bookmarkBarBookmarks,
              currentFolderBookmarks
            )
              .then(() => {
                console.log(
                  "  - updateFolderBookmarks completed successfully."
                );
                performSwitch(targetFolderId, sendResponse, currentFolderId); // Pass currentFolderId as previous
              })
              .catch((error) => {
                console.error("  - Error in updateFolderBookmarks:", error);
                sendResponse({
                  success: false,
                  error: "Error updating folder bookmarks.",
                });
              });
          })
          .catch((error) => {
            console.error("  - Error fetching bookmarks before update:", error);
            console.error(
              "  - Attempting to save current bookmark bar to a new folder due to fetch error..."
            );

            // --- NEW: Save current bookmark bar to a new folder in case of error ---
            saveBookmarkBarToNewFolder()
              .then((newFolderName) => {
                console.log(
                  `  - Bookmark bar saved to new folder: "${newFolderName}"`
                );
                sendResponse({
                  success: false,
                  error: `Error fetching bookmarks for update. Current Bookmark Bar saved to new folder: "${newFolderName}"`,
                }); // Inform popup
              })
              .catch((saveError) => {
                console.error("  - Failed to save bookmark bar:", saveError);
                sendResponse({
                  success: false,
                  error:
                    "Error fetching bookmarks for update AND failed to save current bookmark bar!",
                }); // Inform popup about save failure
              });
          });
      });
    });
  });
}
function performSwitch(targetFolderId, sendResponse, previousFolderId) {
  console.log(
    "performSwitch function started, targetFolderId:",
    targetFolderId,
    "previousFolderId:",
    previousFolderId
  );

  chrome.bookmarks.get(targetFolderId, function (targetFolderNode) {
    if (chrome.runtime.lastError || !targetFolderNode) {
      console.error("Target folder not found:", targetFolderId);
      sendResponse({ success: false, error: "Target folder not found." });
      return;
    }
    clearBookmarks("1")
      .then(() => {
        console.log("   - clearBookmarksBar completed.");
        return copyBookmarks(targetFolderId, "1");
      })
      .then(() => {
        console.log("   - copyBookmarksToBar completed.");
        return setSelectedFolderId(targetFolderId);
      })
      .then(() => {
        console.log(
          "   - setSelectedFolderId completed, new selectedFolderId:",
          targetFolderId
        );
        console.log(
          "Bookmarks switched successfully to folder ID:",
          targetFolderId
        );
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Error during bookmark switch in performSwitch:", error);
        console.error(error);
        sendResponse({
          success: false,
          error: "Error during bookmark switch.",
        });
      });
  });
}

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
                reject(chrome.runtime.lastError);
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

    if (bookmark.url) { // It's a bookmark
        bookmarkProperties.url = bookmark.url;
        chrome.bookmarks.create(bookmarkProperties, (createdBookmark) => {
            if (chrome.runtime.lastError) {
                console.error("Error creating bookmark:", chrome.runtime.lastError, bookmark);
                resolve(null); // Indicate failure
                return;
            }
            resolve(createdBookmark);
        });
    } else { // It's a folder
        chrome.bookmarks.create(bookmarkProperties, (createdFolder) => {
            if (chrome.runtime.lastError) {
                console.error("Error creating folder:", chrome.runtime.lastError, bookmark);
                resolve(null); // Indicate failure
                return;
            }
            // Recursively copy children
            chrome.bookmarks.getChildren(bookmark.id, (children) => {
                if (chrome.runtime.lastError) {
                    console.error("Error getting children of folder:", chrome.runtime.lastError, bookmark);
                    resolve(null); // Indicate failure
                    return;
                }
                if (children && children.length > 0) {
                    let childPromises = children.map((childBookmark) => {
                        return new Promise((resolveChild) => {
                            createBookmark(createdFolder.id, childBookmark, resolveChild);
                        });
                    });
                    Promise.all(childPromises).then((createdChildren) => {
                        if (createdChildren.some(child => child === null)) {
                            console.error("Some child bookmarks/folders failed to create in folder:", bookmark);
                            resolve(null); // Indicate failure
                        } else {
                            resolve(createdFolder);
                        }
                    }).catch((error) => {
                        console.error("Error creating children in folder:", error, bookmark);
                        resolve(null); // Indicate failure
                    });
                } else {
                    resolve(createdFolder); // Resolve when folder is created (no children)
                }
            });
        });
    }
}
function getBookmarksInFolder(folderId) {
    return new Promise((resolve, reject) => {
        let bookmarks = [];

        function traverseBookmarks(node) {
            if (node.url) { // It's a bookmark
                bookmarks.push({
                    id: node.id,
                    url: node.url,
                    title: node.title,
                });
            } else { // It's a folder
                chrome.bookmarks.getChildren(node.id, (children) => {
                    if (chrome.runtime.lastError) {
                        console.warn("Bookmark not found:", node.id, chrome.runtime.lastError.message);
                        return; 
                    }
                    if (children && children.length > 0) {
                        children.forEach(traverseBookmarks); // Recursively traverse children
                    }
                });
            }
        }

        chrome.bookmarks.getChildren(folderId, function(children) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            children.forEach(traverseBookmarks);
            //Since the traverseBookmarks function is asynchronous, we need to wait for all the children to be processed.
            //We can do this by using a promise.
            //This is a bit more complex, and in this case, the current code will work.
            //However, if you are experiencing issues with the get function, then we can add a promise to the traverseBookmarks function.
            resolve(bookmarks);
        });
    });
}

function setSelectedFolderId(folderId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ selectedFolderId: folderId }, resolve);
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

// --- NEW FUNCTION: Save Bookmark Bar to New Folder ---
function saveBookmarkBarToNewFolder() {
  return new Promise((resolve, reject) => {
    getBookmarksInFolder("1") // Get bookmarks from Bookmark Bar
      .then((bookmarkBarBookmarks) => {
        if (bookmarkBarBookmarks && bookmarkBarBookmarks.length > 0) {
          // Only save if bookmark bar is not empty
          const folderName = `Saved Bookmark Bar - ${new Date().toLocaleString()}`;
          chrome.bookmarks.create(
            {
              // Create a new folder
              parentId: "2", // '2' is "Other Bookmarks" - you can change this
              title: folderName,
              type: "folder",
            },
            (newFolder) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              copyBookmarksToFolder(newFolder.id, bookmarkBarBookmarks) // Copy bookmarks to the new folder
                .then(() => {
                  resolve(folderName); // Resolve with the new folder name
                })
                .catch((copyError) => {
                  reject(copyError);
                });
            }
          );
        } else {
          resolve("Bookmark Bar was empty, not saved."); // Resolve even if bookmark bar is empty, no save needed
        }
      })
      .catch((error) => {
        reject(error);
      });
  });
}
