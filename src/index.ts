#!/usr/bin/env node

import { execSync } from "child_process";
import { program } from "commander";
import fs from "fs-extra";
import os from "os";
import path from "path";

interface CommandOptions {
    srcDir: boolean;
    outdir?: string;
    deps: boolean;
}

const tempDir = path.join(os.tmpdir(), "primevue-volt-temp");

program.name("volt-vue");
program.description("Add PrimeVue Volt components to your project");
program.version("0.0.0-alpha.2", "-v, --version", "Output the current version");
program.option("--verbose", "Show detailed error messages");

program
    .command("add")
    .description("Add the specified Volt component to your project")
    .option("--no-src-dir", "Install to root directory instead of src directory")
    .option("--outdir <directory>", "Specify output directory (overrides src-dir option)")
    .option("--no-deps", "Don't automatically install dependencies")
    .argument("<components...>", 'Component name(s) or "all" for all components')
    .action(async (components: string[], options: CommandOptions) => {
        const verbose = program.opts().verbose;

        if (verbose) {
            console.log("🔍 Verbose mode enabled. Showing detailed information.");
            console.log(`📌 Components to add: ${components.join(", ")}`);
            console.log(`📌 Options: ${JSON.stringify(options)}`);
            console.log(`📌 Temporary directory: ${tempDir}`);
            console.log(`📌 Auto-install dependencies: ${options.deps ? "Yes" : "No"}`);
        }

        try {
            fs.removeSync(tempDir);
            fs.ensureDirSync(tempDir);

            execSync(`git clone --depth 1 https://github.com/primefaces/primevue.git ${tempDir}`);

            let baseDir: string;

            if (options.outdir) {
                baseDir = path.join(process.cwd(), options.outdir);

                if (verbose) {
                    console.log(`📌 Using custom output directory: ${baseDir}`);
                }
            } else {
                baseDir = options.srcDir ? path.join(process.cwd(), "src") : process.cwd();

                if (verbose) {
                    console.log(`📌 Using ${options.srcDir ? "src" : "root"} directory: ${baseDir}`);
                }
            }

            const voltDir = path.join(baseDir, "volt");

            if (components.includes("all")) {
                const voltSourceDir = path.join(tempDir, "apps", "volt", "volt");
                const targetDir = voltDir;

                if (!fs.existsSync(voltSourceDir)) {
                    console.error("❌ Volt components directory not found!");
                    return;
                }

                fs.ensureDirSync(targetDir);
                fs.copySync(voltSourceDir, targetDir);

                console.log(`✅ All Volt components successfully added to: ${targetDir}`);
            } else {
                const voltUtilsDir = path.join(tempDir, "apps", "volt", "volt", "utils");
                const targetUtilsDir = path.join(voltDir, "utils");

                if (!fs.existsSync(voltUtilsDir)) {
                    console.warn(`⚠️ Utils folder not found in the repository.`);
                } else {
                    fs.ensureDirSync(voltDir);
                    fs.copySync(voltUtilsDir, targetUtilsDir);
                }

                let successCount = 0;
                let failCount = 0;

                const processedMainComponents = new Set<string>();
                const processedSubComponents = new Map<string, Set<string>>();
                const componentsToProcess = [...components];

                function copySubComponent(mainComponent: string, subPath: string): void {
                    if (!processedSubComponents.has(mainComponent)) {
                        processedSubComponents.set(mainComponent, new Set<string>());
                    }

                    const subComponentSet = processedSubComponents.get(mainComponent)!;
                    if (subComponentSet.has(subPath)) {
                        return;
                    }

                    subComponentSet.add(subPath);

                    const sourcePath = path.join(tempDir, "apps", "volt", "volt", mainComponent, subPath);
                    const targetPath = path.join(voltDir, mainComponent, subPath);

                    if (!fs.existsSync(sourcePath)) {
                        console.warn(`⚠️ Subcomponent ${mainComponent}/${subPath} not found.`);
                        return;
                    }

                    fs.ensureDirSync(path.dirname(targetPath));
                    fs.copySync(sourcePath, targetPath);

                    if (verbose) {
                        console.log(`📌 Copied subcomponent: ${mainComponent}/${subPath}`);
                    }
                }

                function copyFullComponent(component: string): boolean {
                    if (processedMainComponents.has(component)) {
                        return true;
                    }

                    const voltComponentDir = path.join(tempDir, "apps", "volt", "volt", component);

                    if (!fs.existsSync(voltComponentDir)) {
                        console.error(`❌ Component ${component} not found!`);
                        return false;
                    }

                    const targetComponentDir = path.join(voltDir, component);
                    fs.ensureDirSync(path.dirname(targetComponentDir));
                    fs.copySync(voltComponentDir, targetComponentDir);

                    processedMainComponents.add(component);

                    if (verbose) {
                        console.log(`📌 Copied full component: ${component}`);
                    }

                    return true;
                }

                function processComponent(component: string): void {
                    if (components.includes(component)) {
                        if (copyFullComponent(component)) {
                            successCount++;
                        } else {
                            failCount++;
                        }
                        return;
                    }
                }

                function analyzeImports(component: string): void {
                    if (!options.deps) {
                        if (verbose) {
                            console.log(`📌 Skipping dependency analysis for ${component} (--no-deps option used)`);
                        }
                        return;
                    }

                    const indexPath = path.join(tempDir, "apps", "volt", "volt", component, "index.vue");

                    if (!fs.existsSync(indexPath)) {
                        return;
                    }

                    const content = fs.readFileSync(indexPath, "utf8");
                    const importRegex = /import\s+(?:[\w\s{},*]+)\s+from\s+['"]\.\.\/([^'"\/]+)(?:\/([^'"]+))?['"]/g;
                    let match;

                    while ((match = importRegex.exec(content)) !== null) {
                        const dependencyComponent = match[1];
                        const subComponent = match[2];

                        if (dependencyComponent === "utils") {
                            continue;
                        }

                        if (verbose) {
                            console.log(
                                `📌 Found dependency in ${component}: ${dependencyComponent}${
                                    subComponent ? "/" + subComponent : ""
                                }`
                            );
                        }

                        if (components.includes(dependencyComponent)) {
                            continue;
                        }

                        if (subComponent) {
                            copySubComponent(dependencyComponent, `${subComponent}.vue`);

                            if (
                                !processedMainComponents.has(dependencyComponent) &&
                                !componentsToProcess.includes(dependencyComponent)
                            ) {
                                componentsToProcess.push(dependencyComponent);
                            }
                        } else {
                            if (
                                !processedMainComponents.has(dependencyComponent) &&
                                !componentsToProcess.includes(dependencyComponent)
                            ) {
                                componentsToProcess.push(dependencyComponent);

                                copySubComponent(dependencyComponent, "index.vue");
                            }
                        }
                    }
                }

                while (componentsToProcess.length > 0) {
                    const component = componentsToProcess.shift()!;
                    processComponent(component);
                    analyzeImports(component);
                }

                let installLocation: string;
                let subComponentCount = 0;

                if (options.outdir) {
                    installLocation = `${options.outdir}/volt folder`;
                } else {
                    installLocation = options.srcDir ? "src/volt folder" : "root volt folder";
                }

                processedSubComponents.forEach((set) => {
                    subComponentCount += set.size;
                });

                if ((successCount > 0 || subComponentCount > 0) && failCount === 0) {
                    console.log(
                        `✅ ${successCount} main component(s) and ${subComponentCount} subcomponent(s) successfully added to ${installLocation}`
                    );

                    if (options.deps) {
                        const addedDeps = Array.from(processedMainComponents).filter(
                            (comp) => !components.includes(comp)
                        );
                        const addedSubcomps = Array.from(processedSubComponents.entries())
                            .filter(([comp]) => !components.includes(comp))
                            .map(([comp, files]) => `${comp}/${Array.from(files).join(", ")}`)
                            .filter((item) => item.includes("/"));

                        if (addedDeps.length > 0 || addedSubcomps.length > 0) {
                            if (addedDeps.length > 0) {
                                console.log(`  - Main components: ${addedDeps.join(", ")}`);
                            }
                            if (addedSubcomps.length > 0) {
                                console.log(`  - Subcomponents: ${addedSubcomps.join(", ")}`);
                            }
                        }
                    }
                } else if ((successCount > 0 || subComponentCount > 0) && failCount > 0) {
                    console.log(
                        `⚠️ ${successCount} component(s) added, ${failCount} failed. Components were added to ${installLocation}`
                    );
                } else {
                    console.error(`❌ No components were added. All ${failCount} component(s) failed.`);
                    process.exit(1);
                }
            }

            fs.removeSync(tempDir);
        } catch (error) {
            if (error instanceof Error) {
                if (verbose) {
                    console.error(`❌ Detailed error information:`);
                    console.error(error.stack);
                } else {
                    console.error(`❌ Error occurred: ${error.message}`);
                }
            } else {
                console.error(`❌ Unknown error occurred`);
            }

            fs.removeSync(tempDir);
            process.exit(1);
        }
    });

// Handle unknown commands
program.on("command:*", () => {
    console.error("❌ Invalid command: %s", program.args.join(" "));
    console.log("");
    console.log("Available commands:");
    console.log("  add <components>                    - Add component(s) to your project");
    console.log("");
    console.log("Examples:");
    console.log("  volt-vue add button                 - Add button component to src/volt");
    console.log("  volt-vue add panel                  - Add panel with only required dependencies");
    console.log("  volt-vue add panel button           - Add panel and full button component");
    console.log("  volt-vue add --no-src-dir button    - Add button component to root/volt");
    console.log("  volt-vue add --outdir lib button    - Add button component to lib/volt");
    console.log("  volt-vue add --no-deps panel        - Add panel without dependencies");
    console.log("  volt-vue add all                    - Add all components");
    process.exit(1);
});

// Show help if no arguments provided
if (process.argv.length === 2) {
    program.outputHelp();
    process.exit(1);
}

program.parse(process.argv);

// Handle unhandled promise rejections
process.on("unhandledRejection", function (err: Error) {
    const debug = program.opts().verbose;

    if (debug && err instanceof Error) {
        console.error(err.stack);
    }

    console.error("❌ Unhandled error occurred");
    fs.removeSync(tempDir);
    process.exit(1);
});
