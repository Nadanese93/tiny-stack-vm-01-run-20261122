// Tiny stack VM, from ISA.md v1 only. 32-bit wrapping values, 256-value data
// stack, 64-deep call stack, 256 words of memory, traps 2-11, 1,000,000-step
// and 65,536-byte output limits. Deterministic: no clock, no randomness.
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// [opcode, immediate bytes, pops, pushes]; missing opcode = trap 5.
const S: Array<[number, number, number, number]> = [
  [0, 0, 0, 0], [1, 1, 0, 1], [2, 4, 0, 1], [3, 0, 1, 0], [4, 0, 1, 2],
  [5, 0, 2, 2], [6, 0, 2, 3], [7, 0, 3, 3], [16, 0, 2, 1], [17, 0, 2, 1],
  [18, 0, 2, 1], [19, 0, 2, 1], [20, 0, 2, 1], [21, 0, 2, 1], [22, 0, 2, 1],
  [23, 0, 1, 1], [24, 0, 2, 1], [25, 0, 2, 1], [26, 0, 2, 1], [27, 0, 1, 1],
  [28, 0, 2, 1], [29, 0, 2, 1], [30, 0, 2, 1], [32, 0, 2, 1], [33, 0, 2, 1],
  [34, 0, 2, 1], [48, 2, 0, 0], [49, 2, 1, 0], [50, 2, 1, 0], [51, 2, 0, 0],
  [52, 0, 0, 0], [64, 0, 1, 1], [65, 0, 2, 0], [80, 0, 1, 0], [81, 0, 1, 0],
  [82, 0, 0, 1], [83, 0, 1, 0],
];
const IMM = new Int8Array(256).fill(-1);
const POP = new Uint8Array(256);
const PSH = new Uint8Array(256);
for (const [o, m, p, q] of S) { IMM[o] = m; POP[o] = p; PSH[o] = q; }

function run(prog: Buffer, input: Buffer): { out: Buffer; exit: number } {
  const st = new Int32Array(256);
  let sp = 0;
  const cs = new Int32Array(64);
  let cp = 0;
  const mem = new Int32Array(256);
  const ch: Buffer[] = [];
  let ol = 0, ip = 0, pc = 0, steps = 0, exit = -1;
  const n = prog.length;
  const off = () => ((prog[pc + 1] | (prog[pc + 2] << 8)) << 16) >> 16; // signed 16-bit
  while (exit < 0) {
    if (steps >= 1000000) { exit = 10; break; } // step limit
    if (pc < 0 || pc >= n) { exit = 9; break; } // pc outside program
    const op = prog[pc];
    const imm = IMM[op];
    if (imm < 0) { exit = 5; break; } // unknown opcode
    if (pc + 1 + imm > n) { exit = 9; break; } // immediate cut off
    if (sp < POP[op]) { exit = 2; break; } // stack underflow
    if (sp - POP[op] + PSH[op] > 256) { exit = 3; break; } // stack overflow
    steps++;
    const nx = pc + 1 + imm;
    switch (op) {
      case 0: exit = 0; break; // HALT
      case 1: st[sp++] = (prog[pc + 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 2: st[sp++] = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24); break; // PUSH32
      case 3: sp--; break; // POP
      case 4: st[sp] = st[sp - 1]; sp++; break; // DUP
      case 5: { const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t; break; } // SWAP
      case 6: st[sp] = st[sp - 2]; sp++; break; // OVER
      case 7: { const a = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = a; break; } // ROT
      case 23: st[sp - 1] = (-st[sp - 1]) | 0; break; // NEG, wraps
      case 27: st[sp - 1] = ~st[sp - 1]; break; // NOT
      case 48: pc = nx + off(); continue; // JMP
      case 49: pc = st[--sp] === 0 ? nx + off() : nx; continue; // JZ
      case 50: pc = st[--sp] !== 0 ? nx + off() : nx; continue; // JNZ
      case 51: // CALL, unsigned target; 64 held traps 7
        if (cp >= 64) { exit = 7; break; }
        cs[cp++] = nx; pc = prog[pc + 1] | (prog[pc + 2] << 8); continue;
      case 52: // RET, empty call stack traps 8
        if (cp === 0) { exit = 8; break; }
        pc = cs[--cp]; continue;
      case 64: { // LOAD
        const a = st[sp - 1];
        if (a < 0 || a > 255) { exit = 6; break; }
        st[sp - 1] = mem[a]; break;
      }
      case 65: { // STORE: v addr --
        const a = st[sp - 1], v = st[sp - 2];
        if (a < 0 || a > 255) { exit = 6; break; }
        mem[a] = v; sp -= 2; break;
      }
      case 80: { // PRINT, decimal ASCII
        const b = Buffer.from(String(st[--sp]), 'latin1');
        if (ol + b.length > 65536) { exit = 11; break; }
        ch.push(b); ol += b.length; break;
      }
      case 81: { // PUTC, one byte v AND 255
        const v = st[--sp];
        if (ol + 1 > 65536) { exit = 11; break; }
        ch.push(Buffer.from([v & 255])); ol++; break;
      }
      case 82: st[sp++] = ip < input.length ? input[ip++] : -1; break; // IN
      case 83: exit = st[--sp] & 255; break; // EXIT
      default: { // binary ops
        const b = st[--sp], a = st[--sp];
        let r = 0;
        switch (op) {
          case 16: r = (a + b) | 0; break; // ADD
          case 17: r = (a - b) | 0; break; // SUB
          case 18: r = Math.imul(a, b); break; // MUL, low 32 bits
          case 19: if (b === 0) { exit = 4; break; } r = Math.trunc(a / b) | 0; break; // DIV
          case 20: if (b === 0) { exit = 4; break; } r = (a % b) | 0; break; // MOD, sign of a
          case 21: if (b === 0) { exit = 4; break; } r = Math.floor((a >>> 0) / (b >>> 0)) | 0; break; // DIVU
          case 22: if (b === 0) { exit = 4; break; } r = ((a >>> 0) % (b >>> 0)) | 0; break; // MODU
          case 24: r = a & b; break; // AND
          case 25: r = a | b; break; // OR
          case 26: r = a ^ b; break; // XOR
          case 28: r = a << (b & 31); break; // SHL
          case 29: r = a >> (b & 31); break; // SHR, arithmetic
          case 30: r = (a >>> (b & 31)) | 0; break; // SHRU, logical
          case 32: r = a === b ? 1 : 0; break; // EQ
          case 33: r = a < b ? 1 : 0; break; // LT, signed
          case 34: r = (a >>> 0) < (b >>> 0) ? 1 : 0; break; // LTU
        }
        if (exit < 0) st[sp++] = r;
        break;
      }
    }
    if (exit < 0) pc = nx;
  }
  return { out: Buffer.concat(ch), exit };
}

for (const id of readdirSync(I).sort()) {
  const prog = readFileSync(join(I, id, 'program.bin'));
  const input = readFileSync(join(I, id, 'input.bin'));
  const { out, exit } = run(prog, input);
  mkdirSync(join(O, id), { recursive: true, mode: 0o755 });
  chmodSync(join(O, id), 0o755);
  chmodSync(O, 0o755);
  writeFileSync(join(O, id, 'stdout.bin'), out, { mode: 0o644 });
  chmodSync(join(O, id, 'stdout.bin'), 0o644);
  writeFileSync(join(O, id, 'exit.txt'), String(exit) + '\n', { mode: 0o644 });
  chmodSync(join(O, id, 'exit.txt'), 0o644);
}
