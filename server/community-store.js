const emptyData = () => ({
  posts: [],
  announcements: [],
  notifications: [],
  reports: [],
  bookmarks: [],
  marks: [],
  imports: [],
})

export function createCommunityStore(dataStore) {
  let writeQueue = Promise.resolve()

  async function read() {
    return { ...emptyData(), ...dataStore.get('community', emptyData()) }
  }

  async function update(mutator) {
    const operation = writeQueue.then(() => dataStore.update('community', emptyData(), (data) => {
      for (const [key, value] of Object.entries(emptyData())) {
        if (!(key in data)) data[key] = value
      }
      return mutator(data)
    }))
    writeQueue = operation.catch(() => {})
    return operation
  }

  return { read, update }
}
