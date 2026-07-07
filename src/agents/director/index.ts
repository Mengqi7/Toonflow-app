import { descriptor as directorDescriptor } from './DirectorAgent';
import { descriptor as producerDescriptor } from './ProducerAgent';
import { descriptor as supervisorDescriptor } from './SupervisorAgent';
import { descriptor as assistantDirectorDescriptor } from './AssistantDirectorAgent';
import { descriptor as scriptSupervisorDescriptor } from './ScriptSupervisorAgent';
import { descriptor as makeupDescriptor } from './MakeupAgent';
import { descriptor as wardrobeDescriptor } from './WardrobeAgent';
import { descriptor as setDecoratorDescriptor } from './SetDecoratorAgent';
import { descriptor as soundDesignerDescriptor } from './SoundDesignerAgent';

export { directorDescriptor, producerDescriptor, supervisorDescriptor, assistantDirectorDescriptor, scriptSupervisorDescriptor, makeupDescriptor, wardrobeDescriptor, setDecoratorDescriptor, soundDesignerDescriptor };

// 导出所有 descriptors 供 AgentRegistry 扫描
export const descriptors = [
  directorDescriptor,
  producerDescriptor,
  supervisorDescriptor,
  assistantDirectorDescriptor,
  scriptSupervisorDescriptor,
  makeupDescriptor,
  wardrobeDescriptor,
  setDecoratorDescriptor,
  soundDesignerDescriptor,
];
