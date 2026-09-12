"""Controller-owned bounded synthetic TCP/UDP/DNS service; no real secrets."""
import hashlib
import ipaddress
import json
import selectors
import socket
import struct
import sys
import time


def answer(data, dns):
    if not dns:
        return data
    if len(data) < 17 or data[4:6] != b"\x00\x01":
        return None
    offset, labels = 12, []
    while offset < len(data) and data[offset] and len(labels) < 8:
        size = data[offset]
        if size > 63 or offset + size + 1 >= len(data):
            return None
        labels.append(data[offset+1:offset+1+size])
        offset += size + 1
    if not labels or labels[-1] != b"test" or offset + 5 != len(data):
        return None
    # Authoritative synthetic answer only; no upstream DNS.
    return data[:2] + b"\x81\x80\x00\x01\x00\x01\x00\x00\x00\x00" + data[12:] + \
        b"\xc0\x0c\x00\x01\x00\x01\x00\x00\x00\x00\x00\x04\xc0\x00\x02\x7b"


def serve(addresses, receipt):
    selector = selectors.DefaultSelector()
    sockets = []
    for address in addresses:
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        ports = [18080, 5432, 6379, 8443, 53, 853, 443]
        for port in ports:
            for kind in (socket.SOCK_STREAM, socket.SOCK_DGRAM):
                sock = socket.socket(family, kind)
                sock.setsockopt(socket.SOL_SOCKET, socket.SO_MARK, 179)
                if family == socket.AF_INET6:
                    sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                endpoint = (address, port, 0, socket.if_nametoindex("r0")) if address.startswith("fe80:") else (address, port)
                sock.bind(endpoint)
                if kind == socket.SOCK_STREAM:
                    sock.listen(4)
                sock.setblocking(False)
                sockets.append(sock)
                selector.register(sock, selectors.EVENT_READ, (kind, port))
    print("FIXTURE_READY", flush=True)
    end, count = time.monotonic() + 540, 0
    with open(receipt, "x", encoding="utf8") as output:
        def record(data, port, kind):
            output.write(json.dumps({"sha256": hashlib.sha256(data).hexdigest(),
                                     "port": port, "transport": int(kind)}) + "\n")
            output.flush()
        while time.monotonic() < end and count < 512:
            for key, _ in selector.select(0.2):
                sock, (kind, port) = key.fileobj, key.data
                if kind == socket.SOCK_STREAM:
                    connection, peer = sock.accept()
                    connection.setsockopt(socket.SOL_SOCKET, socket.SO_MARK, 179)
                    connection.settimeout(2)
                    try:
                        data = connection.recv(2048)
                        if port == 53 and len(data) >= 2:
                            size = int.from_bytes(data[:2], "big")
                            while len(data) < size + 2:
                                part = connection.recv(size + 2 - len(data))
                                if not part:
                                    break
                                data += part
                            payload = data[2:]
                        else:
                            payload = data
                        record(data, port, kind)
                        response = answer(payload, port == 53)
                        if response:
                            connection.sendall(struct.pack("!H", len(response)) + response
                                               if port == 53 else response)
                    except (TimeoutError, OSError):
                        data = b""
                    finally:
                        connection.close()
                else:
                    data, peer = sock.recvfrom(2048)
                    record(data, port, kind)
                    response = answer(data, port == 53)
                    if response:
                        sock.sendto(response, peer)
                count += 1
    for sock in sockets:
        sock.close()


def request(address, port, protocol):
    # Controller positive control. Never called with an arbitrary public target.
    family = socket.AF_INET6 if ":" in address else socket.AF_INET
    kind = socket.SOCK_DGRAM if protocol == "udp" else socket.SOCK_STREAM
    with socket.socket(family, kind) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_MARK, 179)
        sock.settimeout(2)
        endpoint = (address, port, 0, socket.if_nametoindex("b1p")) if address.startswith("fe80:") else (address, port)
        sock.connect(endpoint)
        sock.send(b"CONTROL")
        if sock.recv(64) != b"CONTROL":
            raise RuntimeError("CONTROL_FAILED")
    print("CONTROL_PASS")


if __name__ == "__main__":
    if sys.argv[1] == "serve":
        serve(sys.argv[2].split(","), sys.argv[3])
    elif sys.argv[1] == "control":
        request(sys.argv[2], int(sys.argv[3]), sys.argv[4])
    else:
        raise SystemExit(2)
