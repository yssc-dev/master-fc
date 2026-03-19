let _eventIdCounter = 0;

export function generateEventId() {
  return `evt_${Date.now()}_${++_eventIdCounter}`;
}
