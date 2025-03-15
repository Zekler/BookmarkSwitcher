chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "switchBookmarks") {
    const targetFolderId = request.folderId;
    console.log(
      "Message received: switchBookmarks to folderId:",
      targetFolderId
    );
    // Make the callback async and await switchBookmarks
    (async () => {
        await switchBookmarks(targetFolderId, sendResponse);
    })();
    return true; // Indicate we will send response asynchronously
  }
});
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
async function switchBookmarks(targetFolderId, sendResponse) {
    console.log(
        "switchBookmarks function started, targetFolderId:",
        targetFolderId
    );

    chrome.storage.sync.get(["selectedFolderId"], async function (result) {
        let currentFolderId = result.selectedFolderId;
        console.log(
            "    - Retrieved currentFolderId from storage:",
            currentFolderId
        );
         // Fetch bookmarks from the Bookmarks Bar and the current folder concurrently
         const bookmarkBarBookmarks = await new Promise((resolve) => {
            chrome.bookmarks.getChildren("1", resolve);
        });

        // 1. Check if currentFolderId exists in storage & Check if the Bookmark Bar has bookmarks
        if ((!currentFolderId || !(await isValidBookmarkId(currentFolderId))) && bookmarkBarBookmarks && bookmarkBarBookmarks.length > 0) {
            console.log("    - Bookmark Bar is not empty. Creating new folder.");
            currentFolderId = await createNewBookmarkFolder();

            // 1.2 Check if folder creation was successful
            if (!currentFolderId) {
                sendResponse({ success: false, error: "Error creating previous folder." });
                return;
            }
        } else {
            console.log("    - Bookmark Bar is empty. Proceeding with null folder.");
            currentFolderId = null;
        }

        // 2. Check if the targetFolderId exists
        chrome.bookmarks.get(targetFolderId, function (targetFolderNode) {
            if (chrome.runtime.lastError || !targetFolderNode) {
                console.error("Target folder not found:", targetFolderId);
                sendResponse({ success: false, error: "Target folder not found." });
                return;
            }

            // 3. Fetch bookmarks from the Bookmarks Bar and the currentFolderId
            Promise.all([
                getBookmarksInFolder("1"),
                currentFolderId ? getBookmarksInFolder(currentFolderId) : Promise.resolve([]),
            ])
            .then(([bookmarkBarBookmarks, currentFolderBookmarks]) => {
                console.log(
                    "    - Fetched Bookmarks - Bookmark Bar:",
                    bookmarkBarBookmarks
                );
                console.log(
                    "    - Fetched Bookmarks - Current Folder:",
                    currentFolderBookmarks
                );

                // 4. Check if currentFolderId is null (empty bookmark bar case)
                if (!currentFolderId) {
                    // 4.1 If currentFolderId is null, proceed directly to switch
                    performSwitch(targetFolderId, sendResponse, null);
                    return;
                }

                // 5. If currentFolderId is not null, update the backup folder
                updateFolderBookmarks(
                    currentFolderId,
                    bookmarkBarBookmarks,
                    currentFolderBookmarks
                )
                    .then(() => {
                        console.log("    - updateFolderBookmarks completed successfully.");
                        // 5.1 Proceed to switch
                        performSwitch(targetFolderId, sendResponse, currentFolderId);
                    })
                    .catch((error) => {
                        console.error("    - Error in updateFolderBookmarks:", error);
                        sendResponse({
                            success: false,
                            error: "Error updating folder bookmarks.",
                        });
                    });
            })
            .catch(async (error) => {
                // 6. Handle errors during bookmark fetching
                console.error("    - Error fetching bookmarks before update:", error);
                console.error(
                    "    - Attempting to save current bookmark bar to a new folder due to fetch error..."
                );

                try {
                    const newFolderId = await createNewBookmarkFolder();
                    console.log(
                        `    - Bookmark bar saved to new folder with ID: "${newFolderId}"`
                    );
                    sendResponse({
                        success: false,
                        error: `Error fetching bookmarks for update. Current Bookmark Bar saved to new folder with ID: "${newFolderId}"`,
                    });
                } catch (saveError) {
                    console.error("    - Failed to save bookmark bar:", saveError);
                    sendResponse({
                        success: false,
                        error:
                            "Error fetching bookmarks for update AND failed to save current bookmark bar!",
                    });
                }
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
function getBookmarksInFolder(folderId) {
  return new Promise((resolve, reject) => {
    let bookmarks = [];

    function traverseBookmarks(node) {
      if (node.url) {
        // It's a bookmark
        bookmarks.push({
          id: node.id,
          url: node.url,
          title: node.title,
        });
      } else {
        // It's a folder
        chrome.bookmarks.getChildren(node.id, (children) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "Bookmark not found:",
              node.id,
              chrome.runtime.lastError.message
            );
            return;
          }
          if (children && children.length > 0) {
            children.forEach(traverseBookmarks); // Recursively traverse children
          }
        });
      }
    }

    chrome.bookmarks.getChildren(folderId, function (children) {
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
    chrome.storage.sync.set({ selectedFolderId: folderId }, resolve);
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
