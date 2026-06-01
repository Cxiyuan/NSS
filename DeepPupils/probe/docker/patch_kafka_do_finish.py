#!/usr/bin/env python3
"""Replace KafkaWriter::DoFinish poll-loop with producer->flush() for offline mode."""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'src/KafkaWriter.cc'

with open(path) as f:
    content = f.read()

old = '''bool KafkaWriter::DoFinish(double network_time) {
  bool success = false;
  int poll_interval = 1000;
  int waited = 0;
  int max_wait = BifConst::Kafka::max_wait_on_shutdown;

  if (!mocking) {
    // wait a bit for queued messages to be delivered
    while (producer->outq_len() > 0 && waited <= max_wait) {
      producer->poll(poll_interval);
      waited += poll_interval;
    }

    // successful only if all messages delivered
    if (producer->outq_len() == 0) {
      success = true;
    } else {
      Error(Fmt("Unable to deliver %0d message(s)", producer->outq_len()));
    }

    delete topic;
    delete producer;
    delete topic_conf;
  }
  delete formatter;
  delete conf;

  return success;
}'''

new = '''bool KafkaWriter::DoFinish(double network_time) {
  bool success = false;
  int max_wait = BifConst::Kafka::max_wait_on_shutdown;

  if (!mocking) {
    // Blocking flush — waits up to max_wait ms for all queued messages
    // to be delivered.  Critical in offline (-r) mode where Zeek may
    // shut down before librdkafka finishes establishing a connection.
    RdKafka::ErrorCode err = producer->flush(max_wait);
    if (err == RdKafka::ERR_NO_ERROR) {
      success = true;
    } else {
      Error(Fmt("Kafka flush failed after %d ms: %s (%0d undelivered)",
                max_wait, RdKafka::err2str(err).c_str(), producer->outq_len()));
    }

    delete topic;
    delete producer;
    delete topic_conf;
  }
  delete formatter;
  delete conf;

  return success;
}'''

if old not in content:
    print(f'[ERROR] Could not find old DoFinish in {path}', file=sys.stderr)
    sys.exit(1)

content = content.replace(old, new)
with open(path, 'w') as f:
    f.write(content)

print('[OK] DoFinish flush patch applied')
