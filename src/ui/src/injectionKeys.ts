import { ComputedRef, InjectionKey, Ref, VNode } from "vue";
import {
	BuilderManager,
	Component,
	Core,
	InstancePath,
	InstancePathItem,
} from "./writerTypes";

export default {
	core: Symbol() as InjectionKey<Core>,
	builderManager: Symbol() as InjectionKey<BuilderManager>,
	evaluatedFields: Symbol() as InjectionKey<Record<string, ComputedRef<any>>>,
	componentId: Symbol() as InjectionKey<Component["id"]>,
	isBeingEdited: Symbol() as InjectionKey<Ref<boolean>>,
	isDisabled: Symbol() as InjectionKey<Ref<boolean>>,
	getChildrenVNodes: Symbol() as InjectionKey<
		(instanceNumber?: InstancePathItem["instanceNumber"]) => VNode[]
	>,
	renderProxiedComponent: Symbol() as InjectionKey<
		(
			componentId: Component["id"],
			instanceNumber: InstancePathItem["instanceNumber"],
			ext?: { class?: string[]; contextSlot?: string },
		) => VNode
	>,
	instancePath: Symbol() as InjectionKey<InstancePath>,
	flattenedInstancePath: Symbol() as InjectionKey<string>,
	instanceData: Symbol() as InjectionKey<Ref[]>,
};
