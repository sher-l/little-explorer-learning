# Browser speech recognition distribution

The game ships an unchanged official k2-fsa/sherpa-onnx 1.12.35 VAD-ASR WebAssembly build:
https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.35
Archive: sherpa-onnx-wasm-simd-1.12.35-vad-asr-zh_en_ja_ko_cantonese-sense_voice_small.tar.bz2

SenseVoiceSmall (FunAudioLLM / Alibaba Group), int8 ONNX conversion dated 2024-07-17, is covered by the **FunASR Model Open Source License Agreement 1.1**, not by sherpa-onnx's code license. The data is split into transport chunks without changing model bytes. Source model: https://huggingface.co/FunAudioLLM/SenseVoiceSmall . The data also contains Silero VAD (Silero Team, MIT), even though this game's adapter uses its own silence energy gate. Both model notices are included.

Pinned source dependencies traced from the official v1.12.35 build files:

| Component | Revision | Notice |
|---|---|---|
| sherpa-onnx contributors | 1.12.35 | Apache-2.0 |
| ONNX Runtime / Microsoft | 1.17.1 WASM SIMD | MIT and bundled ThirdPartyNotices |
| kaldi-native-fbank / Fangjun Kuang and contributors | 1.22.3 | Apache-2.0 |
| kaldi-decoder / k2-fsa contributors | 0.2.11 | Apache-2.0 |
| kaldifst / Xiaomi and contributors | 1.7.17 | Apache-2.0 |
| OpenFst contributors | sherpa-onnx-2024-06-13 fork | Apache-2.0 / COPYING |
| simple-sentencepiece contributors | 0.7 | Apache-2.0 |
| nlohmann/json | 3.12.0 | MIT |
| KISS FFT / Mark Borgerding | febd4caeed32e33ad8b2e0bb5ea77542c40f18ec | BSD-3-Clause / COPYING |
| hclust-cpp / Daniel Müllner, Christoph Dalitz | 2026-02-25 | BSD-2-Clause; included conservatively because diarization defaults ON |
| Emscripten contributors | 3.1.53 | MIT / NCSA, plus system library notices |
| Emscripten musl libc | bundled in 3.1.53 | COPYRIGHT with MIT and component notices |
| Emscripten libc++, libc++abi, compiler-rt | bundled in 3.1.53 | Apache-2.0 with LLVM Exceptions and retained legacy notices |

Full license texts accompany this document. ONNX Runtime's complete supplied ThirdPartyNotices is retained. Root Apache license text also supplies the full Apache terms referenced by OpenFst COPYING. The official build explicitly disables TTS, PortAudio, WebSocket, Python and tests; the TTS-only espeak/piper branch is not part of this VAD-ASR build.

Evidence: https://github.com/k2-fsa/sherpa-onnx/blob/v1.12.35/build-wasm-simd-vad-asr.sh and https://github.com/k2-fsa/sherpa-onnx/blob/v1.12.35/.github/workflows/wasm-simd-hf-space-vad-asr.yaml . Dependency version pins are in that tag's cmake/ directory. The release binary has not been independently rebuilt bit-for-bit or disassembled into an exhaustive linked-symbol bill of materials; this is a source/build/notice audit of the official distribution.

Project modifications are separate adapter files: browser-asr.js, browser-asr-worker.js, mic-worklet.js and poem-recognition.js. They add explicit loading, SHA-256 checks, Worker processing, model-only caching, a silence gate and conservative text matching. The one reviewed whole-line recognition variant is documented in poem-recognition.js. This is not pronunciation scoring. No recorded speech is sent to a server or saved by this adapter.
