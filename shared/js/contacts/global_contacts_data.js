'use strict';

/* globals SimplePhoneMatcher, Normalizer, contacts, MultiContact, Promise */
/* exported GlobalContacts */

/*
 * Module for working with the Global Contacts DataStore (GCDS).
 *
 * This module will deal with the object stored, that follow
 * this structure:
 * {
 *   id: <Generated by the Global Contacts Datastore>
 *   sequence<entry>
 * }
 * where entry is an object like: { uid: <originDsId>, origin: <OriginDs> }
 * <originDsId> contains all the information that allows to locate the
 *              concerned datastore
 *
*/

var GlobalContacts = (function GCDSOps() {
  // The datastore
  var store = null;
  var DS_NAME = 'Global_Contacts_Datastore';

  // The record id that will hold the index data
  var INDEX_ID = 1;
  var isIndexDirty = false;
  var index;

  var datastoreLoading = false;
  var datastoreLoaded = false;
  var DS_LOADED_EVENT = 'datastore_loaded';

  var FIELD_INDEX = {
    'name': 'byName',
    'givenName': 'byGivenName',
    'familyName': 'byFamilyName'
  };

  var matcher = new contacts.MatcherObj();

  var getDatastore = function getDatastore() {
    return new Promise(function(resolve, reject) {
      if (!navigator.getDataStores) {
        reject({
          name: 'DatastoreNotEnabled'
        });
        return;
      }

      if (datastoreLoaded) {
        resolve(store);
        return;
      }

      if (datastoreLoading) {
        document.addEventListener(DS_LOADED_EVENT, function loadedHandler() {
          document.removeEventListener(DS_LOADED_EVENT, loadedHandler);
          resolve(store);
        });
      }

      datastoreLoading = true;
      navigator.getDataStores(DS_NAME).then(function(stores) {
        store = stores[0];
        return loadIndex();
      }, reject).then(function() {
          datastoreLoading = false;
          datastoreLoaded = true;
          document.dispatchEvent(new CustomEvent(DS_LOADED_EVENT));

          resolve(store);
      }, reject);
    });
  };

  function createIndex() {
    return {
      // Will contain all the index of contacts that come from a
      // specific store, indexed by contact uid
      byStore: Object.create(null),

      // By tel number and all its possible variants
      // (We are not supporting dups right now)
      byTel: Object.create(null),
      byEmail: Object.create(null),

      // We need this indexes in order to perform passive matching
      byName: Object.create(null),
      byGivenName: Object.create(null),
      byFamilyName: Object.create(null)
    };
  }

  function setIndex(obj) {
    index = (obj || createIndex());
  }

  function loadIndex() {
    return new Promise(function(resolve, reject) {
      store.get(INDEX_ID).then(function(idx) {
        if (!idx) {
          var theIndex = createIndex();
          setIndex(theIndex);
          store.add(theIndex).then(resolve, reject);
          return;
        }
        isIndexDirty = false;
        setIndex(idx);
        resolve(idx);

      }, reject);
    });
  }

  function indexByPhone(obj, originStore, originDsId, globalDsId) {
    if (Array.isArray(obj.tel)) {
      obj.tel.forEach(function(aTel) {
        var variants = SimplePhoneMatcher.generateVariants(aTel.value);

        variants.forEach(function(aVariant) {
          var indexEntry = index.byTel[aVariant] || [];

          // An entry on the index holds the globalDsId and the local DS
          // info (owner, uid). This is needed as when a local DS contact is
          // removed we need to know the origin of that index entry in order
          // to remove it
          indexEntry.push({
            id: globalDsId,
            owner: originStore.owner,
            uid: originDsId
          });

          index.byTel[aVariant] = indexEntry;
        });
      });
    }
  }

  function indexByEmail(obj, originStore, originDsId, globalDsId) {
    if (Array.isArray(obj.email)) {
      obj.email.forEach(function(aEmail) {
        var indexEntry = index.byEmail[aEmail.value] || [];

        // Avoid pointing two times to the same record
        indexEntry.push({
          id: globalDsId,
          owner: originStore.owner,
          uid: originDsId
        });

        index.byEmail[aEmail.value] = indexEntry;
      });
    }
  }

  function indexByStore(originStore, originDsId, globalDsId) {
    if (!originStore || !originStore.owner || !originDsId || !globalDsId) {
      return;
    }

    var storeIndex = index.byStore[originStore.owner];
    if (!storeIndex) {
      storeIndex = {};
      index.byStore[originStore.owner] = storeIndex;
    }

    storeIndex[originDsId] = globalDsId;
  }

  function normalizeName(str) {
    if (!str || !str.trim()) {
      return '';
    }

    var out = Normalizer.toAscii(str.trim().toLowerCase());

    return out;
  }

  function indexByNames(obj, originStore, originDsId, globalDsId) {
    Object.keys(FIELD_INDEX).forEach(function(aField) {
      var contactField = obj[aField];
      var fieldIndex = index[FIELD_INDEX[aField]];

      if (Array.isArray(contactField) && contactField[0] &&
          contactField[0].trim()) {
        var normalizedName = normalizeName(contactField[0]);
        var indexEntry = fieldIndex[normalizedName] || [];

        indexEntry.push({
          id: globalDsId,
          owner: originStore.owner,
          uid: originDsId
        });

        fieldIndex[normalizedName] = indexEntry;
      }
    });
  }

  function indexEntry(originStore, entryUid, globalDsId, contact) {
    indexByPhone(contact, originStore, entryUid, globalDsId);
    indexByEmail(contact, originStore, entryUid, globalDsId);
    indexByNames(contact, originStore, entryUid, globalDsId);

    indexByStore(originStore, entryUid, globalDsId);

    isIndexDirty = true;
  }

  /**
   *   Adds a new object to the global DS
   *   originStore is the Store origin
   *   originStoreId is the object id in the origin datastore
   *
   */
  var add = function add(originStore, originDsId, contact) {
    return new Promise(function(resolve, reject) {
      var entry = {
        uid: originDsId,
        origin: originStore.owner
      };

      var callbacks = {
        onmatch: function(results) {
          var key = Object.keys(results)[0];

          var entryIdToMerge = results[key].matchingContact.id;
          doAppend(entry, originStore, entryIdToMerge, contact).then(resolve,
                                                                     reject);
        },
        onmismatch: function() {
          doAdd(entry, originStore, contact).then(resolve, reject);
        }
      };

      // The data provider will enable the contacts matcher to search for
      // contacts in this datastore and find the corresponding duplicates
      matcher.dataProvider = GlobalContacts;
      matcher.match(contact, 'passive', callbacks);
    });
  };

  // Adds a new contact. Then it is indexed
  function doAdd(entry, originStore, contact) {
    var data = [entry];

    return new Promise(function(resolve, reject) {
      store.add(data).then(function success(globalDsId) {
        indexEntry(originStore, entry.uid, globalDsId, contact);

        resolve(globalDsId);
      }, reject);
    });
  }

  // Append a contact to an specific index
  function doAppend(entry, originStore, globalDsId, contact) {
    return new Promise(function(resolve, reject) {
      store.get(globalDsId).then(function(obj) {
        if (!obj || !Array.isArray(obj)) {
          obj = [];
        }
        obj.push(entry);

        return store.put(obj, globalDsId);
      }, reject).then(function success() {
          indexEntry(originStore, entry.uid, globalDsId, contact);
          resolve(entry);
        }, reject);
    });
  }

  // Get a list of all contacts by this DS and perform
  // remove operations over it.
  var clear = function clear(originStore) {
    return new Promise(function(resolve, reject) {
      getDatastore().then(function success(store) {
        if (!index) {
          return Promise.reject({
            name: 'IndexNotAvailable'
          });
        }

        // All the GCDS is cleared
        if (!originStore) {
          setIndex();
          isIndexDirty = true;

          store.clear().then(function storeCleared() {
            flush().then(resolve, reject);
          }, reject);
          return null;
        }

        var byStore = index.byStore[originStore.owner];

        if (!byStore) {
          return Promise.reject({
            name: 'DatastoreNotFound'
          });
        }

        var promises = [];
        Object.keys(byStore).forEach(function onKey(key) {
          promises.push(remove(originStore, key));
        });

        return Promise.all(promises);

      }, reject).then(resolve, reject);
    });
  };

  // Removes a contact, from the DS,de-indexing it
  var remove = function remove(originStore, originDsId, contact) {
    var globalDsId;
    return new Promise(function(resolve, reject) {
      getDatastore().then(function success(store) {
        var byStore = index.byStore[originStore.owner];
        if (!byStore) {
          return Promise.reject({
            name: 'DatastoreNotFound'
          });
        }
        globalDsId = byStore[originDsId];

        if (!globalDsId) {
          return Promise.reject({
            name: 'NotFound'
          });
        }
        return store.get(globalDsId);
      }, reject).then(function onEntry(entryList) {
          if (!Array.isArray(entryList)) {
            reject();
            return;
          }
          doRemove(entryList, originStore,
                          originDsId, globalDsId, contact).then(resolve,
                                                                reject);

      }, reject);
    });
  };

  // Removes one component from a contact. We have two cases, a contact
  // with a single component (direct), or a contact that is compound
  // by several entries
  //
  // @param entryList Array of objects containing the components of a contact
  // @param originStore Source datastore for the component we want remove
  // @param originDsId index of the global merged contact
  // @param globalDsId index of the contact in the origin datastore
  function doRemove(entryList, originStore, originDsId, globalDsId, contact) {
    return new Promise(function(resolve, reject) {
      var position = -1;
      entryList.forEach(function onEntry(aEntry, i) {
        if (aEntry.origin === originStore.owner && aEntry.uid === originDsId) {
          position = i;
        }
      });

      if (position !== -1) {
        entryList.splice(position, 1);
      }

      removeIndexes(originStore, originDsId, globalDsId, contact);

      // Update entry or remove it depending on how many are now present
      if (entryList.length === 0) {
        store.remove(globalDsId).then(resolve, reject);
      } else {
        store.put(entryList, globalDsId).then(resolve, reject);
      }
    });
  }

  function removeIndexes(originStore, originDsId, globalDsId, contact) {
    removePhoneIndex(originStore, originDsId, globalDsId, contact);
    removeEmailIndex(originStore, originDsId, globalDsId, contact);
    removeDatastoreIndex(originStore, globalDsId, originDsId);
    removeNameIndexes(originStore, originDsId, globalDsId, contact);

    isIndexDirty = true;
  }

  // This function is used to find a corresponding target element on the index
  // Allowing us to remove it when it is no longer necessary
  // The matching must correspond to the same GCDS id, owner and DS UID
  function fnIndex(target, element) {
    return target.id && element.id === target.id &&
            element.owner === target.owner && element.uid === target.uid;
  }

  function removeAllFromIndex(originStore, indexField) {
    var items = Object.keys(index[indexField]);

    items.forEach(function(item) {
      var entryArray = index[indexField][item];
      var newEntryArray = [];
      for (var j = 0; j < entryArray.length; j++) {
        if (entryArray[j].owner !== originStore.owner) {
          newEntryArray.push(entryArray[j]);
        }
      }
      if (newEntryArray.length > 0) {
        index[indexField][item] = newEntryArray;
      }
      else {
        delete index[indexField][item];
      }
    });

    return;
  }

  function removePhoneIndex(originStore, originDsId, globalDsId,
                            deletedContact) {
    // If there is no contact to delete then all the store pointers are removed
    // from the index
    if (!deletedContact) {
      removeAllFromIndex(originStore, 'byTel');
      return;
    }

    var fnIndexBounded = fnIndex.bind(null, {
      id: globalDsId,
      owner: originStore.owner,
      uid: originDsId
    });

    // Need to update the tel indexes
    if (Array.isArray(deletedContact.tel)) {
      deletedContact.tel.forEach(function(aTel) {
        var variants = SimplePhoneMatcher.generateVariants(aTel.value);

        variants.forEach(function(aVariant) {
          var indexEntry = index.byTel[aVariant];
          if (Array.isArray(indexEntry)) {
            var position = indexEntry.findIndex(fnIndexBounded);

            if (position !== -1) {
              indexEntry.splice(position, 1);
              if (indexEntry.length === 0) {
                delete index.byTel[aVariant];
              }
            }
          }
        });
      });
    }
  }

  function removeDatastoreIndex(originStore, globalDsId, originDsId) {
    var storeIndex = index.byStore[originStore.owner];
    if (storeIndex) {
       delete storeIndex[originDsId];

      if (Object.keys(storeIndex).length === 0) {
        delete index.byStore[originStore.owner];
      }
    }
  }

  function removeEmailIndex(originStore, originDsId, globalDsId, contact) {
    // If there is no contact to delete then all the store pointers are removed
    // from the index
    if (!contact) {
      removeAllFromIndex(originStore, 'byEmail');
      return;
    }

    var fnIndexBounded = fnIndex.bind(null, {
      id: globalDsId,
      owner: originStore.owner,
      uid: originDsId
    });

    if (Array.isArray(contact.email)) {
      contact.email.forEach(function(aEmail) {
        if (aEmail.value) {
          var indexEntry = index.byEmail[aEmail.value];
          if (Array.isArray(indexEntry)) {
            var idx = indexEntry.findIndex(fnIndexBounded);
            if (idx !== -1) {
              indexEntry.splice(idx, 1);
              if (indexEntry.length === 0) {
                delete index.byEmail[aEmail.value];
              }
            }
          }
        }
      });
    }
  }

  function removeNameIndexes(originStore, originDsId, globalDsId, contact) {
    Object.keys(FIELD_INDEX).forEach(function(aField) {
      if (!contact) {
        removeAllFromIndex(originStore, FIELD_INDEX[aField]);
        return;
      }

      var contactField = contact[aField];
      var fieldIndex = index[FIELD_INDEX[aField]];

      var fnIndexBounded = fnIndex.bind(null, {
        id: globalDsId,
        owner: originStore.owner,
        uid: originDsId
      });

      if (Array.isArray(contactField) && contactField[0] &&
          contactField[0].trim()) {
        var normalizedName = normalizeName(contactField[0]);
        var indexEntry = fieldIndex[normalizedName];

        if (Array.isArray(indexEntry)) {
          var idx = indexEntry.findIndex(fnIndexBounded);
          if (idx !== -1) {
            fieldIndex[normalizedName].splice(idx, 1);
            if (fieldIndex[normalizedName].length === 0) {
              delete fieldIndex[normalizedName];
            }
          }
        }
      }
    });
  }

  /**
   *  Returns just an entry on GCDS
   *
   */
   var getEntry = function getEntry(globalDsId) {
    return getDatastore().then(function success(store) {
      return store.get(globalDsId);
    });
  };

  /**
   *  Returns all the data (merged contact) corresponding
   *  to the GCDS entry
   *
   */
  var getData = function getData(globalDsId) {
    return getEntry(globalDsId).then(function success(entry) {
      return MultiContact.getData({
        id: globalDsId,
        entryData: entry
      });
    });
  };

  var findBy = function findBy(field, strToFind) {
    if (!field || !strToFind || !field.trim() || !strToFind.trim()) {
      return Promise.resolve([]);
    }

    return getDatastore().then(function success(store) {
      var contactIds;

      switch (field) {
        case 'tel':
          var variants = SimplePhoneMatcher.generateVariants(strToFind);
          contactIds = [];
          variants.forEach(function(aVariant) {
            var ids = index.byTel[aVariant];

            if (Array.isArray(ids)) {
              ids.forEach(function(aId) {
                if (contactIds.indexOf(aId) === -1) {
                  contactIds.push(aId);
                }
              });
            }
          });
        break;

        case 'email':
          contactIds = index.byEmail[strToFind];
        break;

        case 'name':
        case 'givenName':
        case 'familyName':
          var indexEntry = index[FIELD_INDEX[field]];
          var strNormalized = normalizeName(strToFind);
          contactIds = indexEntry[strNormalized];
        break;
      }

      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return Promise.resolve([]);
      }

      var onlyContactIds = [];
      contactIds.forEach(function(aVal) {
        if (onlyContactIds.indexOf(aVal) === -1) {
          onlyContactIds.push(aVal.id);
        }
      });

      return getContactData(onlyContactIds);
    });
  };

  function getContactData(contactIds) {
    return new Promise(function(resolve, reject) {
      // store.get for the moment does not support array of ids but
      // a variable number of arguments. Probably bug 1038661 will fix that
      store.get.apply(store, contactIds).then(function success(entries) {
        if (contactIds.length === 1) {
          entries = [entries];
        }
        var operations = entries.map(function(aEntry, i) {
          return MultiContact.getData({
            id: contactIds[i],
            entryData: aEntry
          });
        });

        return Promise.all(operations);
      
      }, reject).then(resolve, reject);
    });
  }

  // This is needed for the contacts matcher module to adapt to the
  // expected interface
  var findAdapter = function findAdapter(options) {
    var by = options.filterBy[0];
    var targetValue = options.filterValue;

    return {
      set onsuccess(cb) {
        findBy(by, targetValue).then(function success(result) {
          this.result = result;
          cb();
        }.bind(this), this.errorCb);
      },
      set onerror(errorCb) {
        this.errorCb = errorCb;
      }
    };
  };

  var flush = function flush() {
    if (!store) {
      return Promise.reject();
    }

    if (!isIndexDirty) {
      return Promise.resolve();
    }
    isIndexDirty = false;
    return store.put(index, INDEX_ID);
  };

  return {
    add: add,
    remove: remove,
    flush: flush,
    clear: clear,
    getEntry: getEntry,
    getData: getData,
    get revisionId() {
      return store.revisionId;
    },
    findBy: findBy,
    find: findAdapter
  };

})();
