import { EventEmitter } from 'events';

// Singleton instance of the event bus
export const cognitiveBus = new EventEmitter();

// Event Types
export const EVENTS = {
    ANALYZE_INTERACTION: 'analyze_interaction',
    MEMORY_EVOLUTION: 'memory_evolution',
    PATTERN_DETECTED: 'pattern_detected',
    SLEEP_PROCESSING: 'sleep_processing'
};
