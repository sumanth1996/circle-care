"""TOTP codes for the e2e scripts that sign in through the real server (CC-200).

Standard library only: RFC 4226 HOTP, RFC 6238 TOTP and RFC 4648 base32, matching
server/totp.ts (SHA-1, 6 digits, 30-second steps). The server accepts the step
before and after the current one, and each step only once per account, so
`Authenticator.code()` hands out the current step, or the next one if the current
step was already used, and waits only when both have been used. (It never hands
out the previous step: that one could roll out of the window on the way.)

    python3 tests/e2e/totp_helper.py   # checks the RFC test vectors
"""
import base64
import hashlib
import hmac
import struct
import time

STEP = 30


def b32decode(secret: str) -> bytes:
    s = "".join(secret.split()).replace("-", "").upper()
    return base64.b32decode(s + "=" * (-len(s) % 8))


def hotp(key: bytes, counter: int, digits: int = 6, algorithm=hashlib.sha1) -> str:
    mac = hmac.new(key, struct.pack(">Q", counter), algorithm).digest()
    off = mac[-1] & 0x0F
    n = struct.unpack(">I", mac[off:off + 4])[0] & 0x7FFFFFFF
    return str(n % 10 ** digits).zfill(digits)


def totp(key: bytes, t: float, digits: int = 6, algorithm=hashlib.sha1) -> str:
    return hotp(key, int(t // STEP), digits, algorithm)


class Authenticator:
    """An authenticator app for one account: remembers the last step it gave out."""

    def __init__(self, secret: str):
        self.key = b32decode(secret)
        self.last = None

    def code(self) -> str:
        while True:
            now = int(time.time() // STEP)
            c = now if self.last is None else max(now, self.last + 1)
            if c <= now + 1:
                self.last = c
                return hotp(self.key, c)
            time.sleep(1)

    def wrong_code(self) -> str:
        """A 6-digit code that matches none of the steps the server would accept now."""
        now = int(time.time() // STEP)
        valid = {hotp(self.key, c) for c in range(now - 2, now + 3)}
        return next(x for x in ("000000", "111111", "123456", "999999") if x not in valid)


if __name__ == "__main__":
    # RFC 4226 appendix D
    k = b"12345678901234567890"
    want = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    assert [hotp(k, i) for i in range(10)] == want
    # RFC 6238 appendix B (8 digits; SHA-256 and SHA-512 use longer seeds)
    seeds = {hashlib.sha1: k, hashlib.sha256: b"12345678901234567890123456789012",
             hashlib.sha512: b"1234567890123456789012345678901234567890123456789012345678901234"}
    vectors = [(59, "94287082", "46119246", "90693936"), (1111111109, "07081804", "68084774", "25091201"),
               (1111111111, "14050471", "67062674", "99943326"), (1234567890, "89005924", "91819424", "93441116"),
               (2000000000, "69279037", "90698825", "38618901"), (20000000000, "65353130", "77737706", "47863826")]
    for t, s1, s256, s512 in vectors:
        assert totp(seeds[hashlib.sha1], t, 8, hashlib.sha1) == s1, t
        assert totp(seeds[hashlib.sha256], t, 8, hashlib.sha256) == s256, t
        assert totp(seeds[hashlib.sha512], t, 8, hashlib.sha512) == s512, t
    # RFC 4648 section 10
    assert b32decode("MZXW6YTBOI") == b"foobar" and b32decode("mzxw 6") == b"foo"
    # Two codes in a row use two different steps, both inside the server's window.
    a = Authenticator(base64.b32encode(k).decode())
    a.code(); first = a.last
    a.code(); assert a.last == first + 1 and a.last <= int(time.time() // STEP) + 1
    assert a.wrong_code() not in {hotp(a.key, c) for c in range(first - 1, first + 4)}
    print("totp_helper: RFC 4226, RFC 6238 and RFC 4648 vectors pass")
