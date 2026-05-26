from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ScanResult:
    clean: bool
    message: str


class VirusScannerProvider(ABC):
    @abstractmethod
    async def scan(self, content: bytes, filename: str = "") -> ScanResult:
        ...


class NoopVirusScanner(VirusScannerProvider):
    async def scan(self, content: bytes, filename: str = "") -> ScanResult:
        return ScanResult(clean=True, message="No antivirus configured")


class ClamAvVirusScanner(VirusScannerProvider):
    """ClamAV antivirus scanner via clamd socket.

    Requires clamav-daemon running and accessible.
    Socket path defaults to /var/run/clamav/clamd.ctl or
    can be configured via environment variable CLAMD_SOCKET_PATH.
    """

    def __init__(self, socket_path: str = "/var/run/clamav/clamd.ctl"):
        self.socket_path = socket_path

    async def scan(self, content: bytes, filename: str = "") -> ScanResult:
        import socket as sock_mod
        try:
            s = sock_mod.socket(sock_mod.AF_UNIX, sock_mod.SOCK_STREAM)
            s.settimeout(30)
            s.connect(self.socket_path)
            s.sendall(b"zINSTREAM\0")
            s.sendall(len(content).to_bytes(4, "big") + content)
            s.sendall(b"\x00\x00\x00\x00")
            response = s.recv(4096).decode("utf-8", errors="ignore")
            s.close()
            if "OK" in response:
                return ScanResult(clean=True, message="Clean")
            return ScanResult(clean=False, message=response.strip())
        except Exception as e:
            return ScanResult(clean=False, message=f"Scan error: {e}")


def get_virus_scanner() -> VirusScannerProvider:
    return NoopVirusScanner()
