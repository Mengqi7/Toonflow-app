import { ToolRegistry } from "../tools/ToolRegistry";
import { ToolRuntime } from "../tools/ToolRuntime";
import { registerDomainTools } from "../tools/registerDomainTools";
import { ContextResolver } from "./ContextResolver";
import { ConversationalDirector } from "./ConversationalDirector";
import { GenerationProviderRegistry } from "../generation/GenerationProviderRegistry";
import { GenerationService } from "../generation/GenerationService";
import { ToonflowGenerationAdapter } from "../generation/ToonflowGenerationAdapter";
import { ProductionDomainService } from "../domain/ProductionDomainService";

export const workbenchGenerationProviders = new GenerationProviderRegistry();
const toonflowGenerationAdapter = new ToonflowGenerationAdapter();
workbenchGenerationProviders.register(toonflowGenerationAdapter, ["text", "image", "video", "audio"]);
export const workbenchGenerationService = new GenerationService(workbenchGenerationProviders);
export const workbenchProductionDomainService = new ProductionDomainService(workbenchGenerationService);
export const workbenchToolRegistry = registerDomainTools(new ToolRegistry(), workbenchProductionDomainService);
export const workbenchToolRuntime = new ToolRuntime(workbenchToolRegistry);
export const workbenchContextResolver = new ContextResolver();
export const conversationalDirector = new ConversationalDirector(workbenchToolRuntime);

export * from "./contracts";
export * from "./ArtifactGraph";
export * from "./ContextResolver";
export * from "./ConversationalDirector";
export * from "./DirectorToolPlanner";
export * from "./acceptanceCase";
