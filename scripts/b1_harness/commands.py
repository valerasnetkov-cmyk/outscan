"""Bounded subprocess transport, fixed executable map, no shell."""
import subprocess
import threading
from .config import ENV

BIN = {"docker": "/usr/bin/docker", "ip": "/usr/sbin/ip", "nsenter": "/usr/bin/nsenter",
       "iptables": "/usr/sbin/iptables", "ip6tables": "/usr/sbin/ip6tables",
       "iptables-save": "/usr/sbin/iptables-save", "ip6tables-save": "/usr/sbin/ip6tables-save",
       "nft": "/usr/sbin/nft", "systemd-run": "/usr/bin/systemd-run", "systemctl": "/usr/bin/systemctl",
       "python": "/usr/bin/python3", "sysctl": "/usr/sbin/sysctl", "ss": "/usr/bin/ss"}


class Executor:
    def __call__(self, operation, args, timeout=20):
        if operation not in BIN or not isinstance(args, list):
            raise ValueError("OPERATION_NOT_ALLOWED")
        if any(type(a) is not str or "\x00" in a for a in args):
            raise ValueError("ARGV")
        argv = [BIN[operation], *args]
        proc = subprocess.Popen(argv, shell=False, env=ENV, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output = bytearray()
        overflow = threading.Event()

        def drain():
            while True:
                chunk = proc.stdout.read(4096)
                if not chunk:
                    return
                if len(output) + len(chunk) > 65536:
                    overflow.set()
                    proc.kill()
                    return
                output.extend(chunk)

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
            raise RuntimeError("COMMAND_TIMEOUT") from None
        finally:
            reader.join(timeout=1)
            proc.stdout.close()
        if overflow.is_set() or reader.is_alive():
            raise RuntimeError("COMMAND_OUTPUT_BOUND")
        if proc.returncode:
            # Do not leak privileged diagnostics into the public report.
            raise RuntimeError("COMMAND_FAILED:" + operation)
        return output.decode("utf-8", errors="strict").strip()


def docker(execute, *args):
    return execute("docker", ["--host", "unix:///var/run/docker.sock", *args])
