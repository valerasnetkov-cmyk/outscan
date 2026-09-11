import { beforeEach, describe, expect, it, vi } from "vitest";

const filesystem = vi.hoisted(() => ({ lstat: vi.fn(), open: vi.fn() }));
vi.mock("node:fs/promises", () => filesystem);

import { readMountedJsonFile } from "../src/trusted-files/private-json.js";

const original = Buffer.from('{"ok":true}');
const metadata = {
  dev: 1,
  ino: 2,
  size: original.length,
  mode: 0o600,
  mtimeMs: 10,
  ctimeMs: 10,
  isFile: () => true,
  isSymbolicLink: () => false,
};

function mount(content = original, chunkSize = 2) {
  const handle = {
    stat: vi.fn().mockResolvedValue({ ...metadata }),
    close: vi.fn().mockResolvedValue(undefined),
    read: vi.fn(
      async (
        buffer: Buffer,
        offset: number,
        length: number,
        position: number,
      ) => {
        const bytesRead = Math.min(
          length,
          chunkSize,
          content.length - position,
        );
        content.copy(buffer, offset, position, position + bytesRead);
        return { bytesRead, buffer };
      },
    ),
  };
  filesystem.lstat.mockResolvedValue({ ...metadata });
  filesystem.open.mockResolvedValue(handle);
  return handle;
}

beforeEach(() => vi.resetAllMocks());

describe("bounded mounted JSON reads", () => {
  it("assembles partial positional reads and closes the handle", async () => {
    const handle = mount();
    await expect(
      readMountedJsonFile("fixture", 4096, "PRIVATE"),
    ).resolves.toEqual({ ok: true });
    expect(handle.close).toHaveBeenCalledOnce();
    expect(
      handle.read.mock.calls.every(
        ([buffer]) => buffer.length === original.length + 1,
      ),
    ).toBe(true);
  });

  it("reads at most the original size plus one byte if the file grows", async () => {
    const handle = mount(
      Buffer.concat([original, Buffer.alloc(100_000, 32)]),
      100_000,
    );
    await expect(
      readMountedJsonFile("fixture", 4096, "PRIVATE"),
    ).resolves.toBeNull();
    expect(handle.read).toHaveBeenCalledOnce();
    expect(handle.read.mock.calls[0]?.[2]).toBe(original.length + 1);
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it("denies a truncated file", async () => {
    const handle = mount(original.subarray(0, 5));
    await expect(
      readMountedJsonFile("fixture", 4096, "PRIVATE"),
    ).resolves.toBeNull();
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it.each([{ size: 100 }, { mtimeMs: 11 }, { ctimeMs: 11 }])(
    "denies metadata changes after the bounded read: %j",
    async (change) => {
      const handle = mount();
      handle.stat
        .mockResolvedValueOnce({ ...metadata })
        .mockResolvedValueOnce({ ...metadata, ...change });
      await expect(
        readMountedJsonFile("fixture", 4096, "PRIVATE"),
      ).resolves.toBeNull();
      expect(handle.close).toHaveBeenCalledOnce();
    },
  );

  it("closes the handle when reading fails", async () => {
    const handle = mount();
    handle.read.mockRejectedValueOnce(new Error("READ_FAILED"));
    await expect(
      readMountedJsonFile("fixture", 4096, "PRIVATE"),
    ).rejects.toThrow("READ_FAILED");
    expect(handle.close).toHaveBeenCalledOnce();
  });

  it.each([0, -1, NaN, Infinity, 1.5])(
    "denies invalid byte budget %s before filesystem access",
    async (limit) => {
      await expect(
        readMountedJsonFile("fixture", limit, "PRIVATE"),
      ).resolves.toBeNull();
      expect(filesystem.lstat).not.toHaveBeenCalled();
    },
  );
});
