#!/usr/bin/env python3
"""PTY worker process. Communicates via JSON lines over stdin/stdout.

Protocol:
  stdin  (from parent): {"type":"input","data":"..."} or {"type":"resize","cols":N,"rows":N}
  stdout (to parent):   {"type":"output","data":"..."} or {"type":"exit","code":N}
"""

import pty, os, sys, select, json, fcntl, termios, struct, signal, errno

def set_winsize(fd, rows, cols):
    winsize = struct.pack('HHHH', rows, cols, 0, 0)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

def main():
    shell = os.environ.get('SHELL', '/bin/zsh')
    cwd = os.environ.get('PTY_CWD', os.getcwd())
    cols = int(os.environ.get('PTY_COLS', '80'))
    rows = int(os.environ.get('PTY_ROWS', '24'))

    master, slave = pty.openpty()
    set_winsize(master, rows, cols)

    pid = os.fork()
    if pid == 0:
        # Child: become session leader, attach to PTY, exec shell
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(master)
        os.close(slave)
        os.chdir(cwd)
        env = dict(os.environ)
        env['TERM'] = 'xterm-256color'
        # Remove PTY_* vars
        env.pop('PTY_CWD', None)
        env.pop('PTY_COLS', None)
        env.pop('PTY_ROWS', None)
        os.execve(shell, [shell, '-l'], env)
    else:
        # Parent: relay I/O between stdin/stdout and master PTY fd
        os.close(slave)

        # Make stdin non-blocking
        flags = fcntl.fcntl(sys.stdin.fileno(), fcntl.F_GETFL)
        fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)

        # Buffer for incomplete JSON lines from stdin
        stdin_buf = b''

        def send_json(obj):
            line = json.dumps(obj, ensure_ascii=False) + '\n'
            sys.stdout.write(line)
            sys.stdout.flush()

        child_pid = pid

        def on_sigchld(signum, frame):
            nonlocal child_pid
            try:
                wpid, status = os.waitpid(child_pid, os.WNOHANG)
                if wpid > 0:
                    code = os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1
                    send_json({"type": "exit", "code": code})
                    sys.exit(0)
            except ChildProcessError:
                pass

        signal.signal(signal.SIGCHLD, on_sigchld)

        try:
            while True:
                try:
                    rlist, _, _ = select.select([master, sys.stdin.fileno()], [], [], 0.1)
                except (select.error, ValueError):
                    break

                for fd in rlist:
                    if fd == master:
                        try:
                            data = os.read(master, 16384)
                            if not data:
                                send_json({"type": "exit", "code": 0})
                                return
                            send_json({"type": "output", "data": data.decode('utf-8', errors='replace')})
                        except OSError as e:
                            if e.errno == errno.EIO:
                                # PTY closed
                                send_json({"type": "exit", "code": 0})
                                return
                            raise

                    elif fd == sys.stdin.fileno():
                        try:
                            chunk = os.read(sys.stdin.fileno(), 65536)
                            if not chunk:
                                # Parent closed stdin
                                return
                            stdin_buf += chunk
                        except OSError:
                            return

                        # Process complete JSON lines
                        while b'\n' in stdin_buf:
                            line, stdin_buf = stdin_buf.split(b'\n', 1)
                            if not line.strip():
                                continue
                            try:
                                msg = json.loads(line)
                                if msg.get('type') == 'input' and 'data' in msg:
                                    os.write(master, msg['data'].encode('utf-8'))
                                elif msg.get('type') == 'resize':
                                    c = msg.get('cols', 80)
                                    r = msg.get('rows', 24)
                                    set_winsize(master, r, c)
                                    os.kill(child_pid, signal.SIGWINCH)
                            except (json.JSONDecodeError, OSError):
                                pass

        except KeyboardInterrupt:
            pass
        finally:
            try:
                os.kill(child_pid, signal.SIGHUP)
                os.waitpid(child_pid, 0)
            except (ProcessLookupError, ChildProcessError):
                pass
            os.close(master)

if __name__ == '__main__':
    main()
