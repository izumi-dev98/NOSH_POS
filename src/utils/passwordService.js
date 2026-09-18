const textEncoder = new TextEncoder();
const ITERATIONS = 120000;
const KEY_LENGTH = 256;
const SALT_LENGTH = 16;

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_LENGTH
  );
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
};

export const verifyPassword = async (password, storedHash) => {
  if (!storedHash?.startsWith("pbkdf2$")) return false;
  const [, iterationText, saltText, expectedText] = storedHash.split("$");
  const iterations = Number(iterationText);
  if (!iterations || !saltText || !expectedText) return false;

  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromBase64(saltText), iterations, hash: "SHA-256" },
    key,
    KEY_LENGTH
  );
  const actual = new Uint8Array(bits);
  const expected = fromBase64(expectedText);
  if (actual.length !== expected.length) return false;

  let difference = 0;
  actual.forEach((value, index) => { difference |= value ^ expected[index]; });
  return difference === 0;
};
