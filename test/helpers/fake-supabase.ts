import { vi } from 'vitest';

export interface FakeResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}

export type RecordedOp = [string, ...unknown[]];

/** Records the operations called on it, so tests can assert on filters
 *  (`.eq('owner', …)`) and not only on outputs. */
class FakeBuilder implements PromiseLike<FakeResult> {
  readonly ops: RecordedOp[] = [];
  constructor(private readonly result: FakeResult) {}

  private push(op: string, ...args: unknown[]): this {
    this.ops.push([op, ...args]);
    return this;
  }

  select = (...a: unknown[]) => this.push('select', ...a);
  insert = (...a: unknown[]) => this.push('insert', ...a);
  upsert = (...a: unknown[]) => this.push('upsert', ...a);
  delete = (...a: unknown[]) => this.push('delete', ...a);
  eq = (...a: unknown[]) => this.push('eq', ...a);
  order = (...a: unknown[]) => this.push('order', ...a);
  maybeSingle = () => this.push('maybeSingle');
  single = () => this.push('single');

  then<R1 = FakeResult, R2 = never>(
    onOk?: ((v: FakeResult) => R1 | PromiseLike<R1>) | null,
    onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.result).then(onOk, onErr);
  }
}

export function fakeSupabase(
  tables: Record<string, FakeResult | FakeResult[]>,
  rpcResults: Record<string, FakeResult> = {},
) {
  const builders: { table: string; builder: FakeBuilder }[] = [];
  const queues = new Map<string, FakeResult[]>(
    Object.entries(tables).map(([t, r]) => [t, Array.isArray(r) ? [...r] : [r]]),
  );

  const rpc = vi.fn(async (name: string) => rpcResults[name] ?? { data: null, error: null });

  const from = vi.fn((table: string) => {
    const queue = queues.get(table) ?? [];
    // One result answers every call; a list is consumed in order.
    const result = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null });
    const builder = new FakeBuilder(result);
    builders.push({ table, builder });
    return builder;
  });

  return {
    client: { from, rpc } as never,
    from,
    rpc,
    /** Ops recorded for the nth query against a table, in call order. */
    opsFor(table: string, nth = 0): RecordedOp[] {
      return builders.filter((b) => b.table === table)[nth]?.builder.ops ?? [];
    },
    tableCalls(table: string): number {
      return builders.filter((b) => b.table === table).length;
    },
  };
}
