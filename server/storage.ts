// Minimal stub to satisfy imports from old service files
// These services are not used in the minimal backend

export const storage = {
  getUser: async () => null,
  getUserByEmail: async () => null,
  createUser: async () => null,
  updateUser: async () => null,
  getMessages: async () => [],
  createMessage: async () => null,
  getSessions: async () => [],
  createSession: async () => null,
  getMemories: async () => [],
  createMemory: async () => null,
  updateMemory: async () => null,
  searchMemories: async () => [],
};

export default storage;
