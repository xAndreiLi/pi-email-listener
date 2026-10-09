/**
 * The detached fetcher's entry point, in plain JavaScript on purpose.
 *
 * An npm-installed copy of this package lives under node_modules, where Node refuses to strip
 * TypeScript types, so the fetcher is loaded through jiti — the loader pi itself uses for
 * extensions — which works from any location. Its output is the service log, so a failed start is
 * reported there.
 *
 *   node src/daemon.mjs          poll forever
 *   node src/daemon.mjs --once   one pass per account, then exit
 */
import { createJiti } from "jiti";

try {
	const { run } = await createJiti(import.meta.url).import("./fetcher.ts");
	await run();
} catch (error) {
	console.error(`${new Date().toISOString()} the fetcher could not run: ${error?.stack ?? error}`);
	process.exit(1);
}
