import { buildSeedContributions } from '../../../prisma/seed';
        import { generateWrap } from './generate';

        async function run() {
          const contributions = buildSeedContributions().map((item, index) => ({
            id: `seed-${index}`,
            userId: 'demo-user',
            source: item.source,
            category: item.category,
            signal: item.signal,
            rawData: item.rawData,
            occurredAt: item.occurredAt,
            weight: item.weight,
            externalId: item.externalId,
            externalUrl: item.externalUrl,
            createdAt: item.occurredAt,
          }));

          const tests = [
            {
              label: 'Snapshot',
              mode: 'snapshot' as const,
              windowStart: new Date(Date.UTC(2025, 3, 1)),
              windowEnd: new Date(Date.UTC(2025, 5, 30)),
            },
            {
              label: 'Year-End',
              mode: 'year-end' as const,
              windowStart: new Date(Date.UTC(2025, 0, 1)),
              windowEnd: new Date(Date.UTC(2025, 11, 31)),
            },
          ];

          for (const test of tests) {
            const startedAt = Date.now();
            const filtered = contributions.filter(
              (item) => item.occurredAt >= test.windowStart && item.occurredAt <= test.windowEnd,
            );
            const output = await generateWrap({
              contributions: filtered,
              mode: test.mode,
              windowStart: test.windowStart,
              windowEnd: test.windowEnd,
            });
            console.log(`
=== ${test.label} (${Date.now() - startedAt}ms) ===`);
            console.dir(output, { depth: null });
          }
        }

        run().catch((error) => {
          console.error(error);
          process.exit(1);
        });
