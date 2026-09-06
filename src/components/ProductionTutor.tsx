import React from 'react';
import AiAssistantPanel from './AiAssistantPanel';
import { browserTeachingEngine } from '../services/browserTeachingEngine';

export type ProductionTutorProps = Omit<React.ComponentProps<typeof AiAssistantPanel>, 'teachingEngine'>;

export default function ProductionTutor(props: ProductionTutorProps) {
  return <AiAssistantPanel {...props} teachingEngine={browserTeachingEngine} />;
}
