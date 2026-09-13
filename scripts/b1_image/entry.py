"""Explicit workflow stages. Importing modules never starts Docker or networking."""
from pathlib import Path
import sys
import re

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.b1_image.core import Context
from scripts.b1_image.build import source, base, builds, remove_builders
from scripts.b1_image.smoke import smoke, smoke_service, cleanup, timer, stop_controller
from scripts.b1_image.publish import publish


def recovery(ctx):
    operations = []
    if ctx.state.get("controller_unit"):
        operations.append(lambda: stop_controller(ctx))
    operations.append(lambda: cleanup(ctx))
    if ctx.state.get("timer"):
        operations.append(lambda: timer(ctx, "stop"))
    operations.append(lambda: remove_builders(ctx))
    failures = 0
    for operation in operations:
        try:
            operation()
        except Exception:
            failures += 1
    if failures:
        raise RuntimeError("RECOVERY_INCOMPLETE")


def watchdog(ctx):
    ctx.record("watchdog-fired.json", {"status": "FIRED", "run": ctx.state["run"]})
    try:
        stop_controller(ctx)
    finally:
        cleanup(ctx, watchdog=True)


def main():
    stages = {"source": source, "base": base, "build": builds, "smoke": smoke, "smoke-service": smoke_service,
              "publish": publish, "cleanup": recovery, "watchdog": watchdog}
    if len(sys.argv) != 2 or sys.argv[1] not in stages:
        raise SystemExit("INVALID_STAGE")
    ctx = Context()
    try:
        stages[sys.argv[1]](ctx)
    except Exception as error:
        # Never print transport errors, environment, auth responses or token-bearing requests.
        code = str(error) if isinstance(error, RuntimeError) and re.fullmatch(r"[A-Z_]+", str(error)) else "STAGE_ERROR"
        ctx.record("failure-" + sys.argv[1] + ".json", {"stage": sys.argv[1], "result": "FAIL",
                                                       "errorType": type(error).__name__, "code": code})
        raise SystemExit("B1_IMAGE_STAGE_FAILED: " + sys.argv[1]) from None


if __name__ == "__main__":
    main()
