import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import UIKit

/// One deck pending import: either the pasted-JSON slot, or one picked file.
private struct ImportCandidate: Identifiable {
    let id: String
    var label: String
    var parseError: String?
    var validated: ValidatedImport?
    var resolution: DuplicateResolution = .importAsCopy
    var clashName: String?
}

struct ImportView: View {
    var prefilledJSON: String?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var jsonText = ""
    @State private var showFileImporter = false
    @State private var candidates: [ImportCandidate] = []
    @State private var showReplaceConfirm = false
    @State private var justCopiedPrompt = false

    private var importableCount: Int {
        candidates.filter { $0.validated?.isImportable == true }.count
    }

    private var replacingClashes: [ImportCandidate] {
        candidates.filter {
            $0.resolution == .replaceExisting && $0.clashName != nil && $0.validated?.isImportable == true
        }
    }

    private var replaceConfirmTitle: String {
        if replacingClashes.count == 1 {
            return "Replace \"\(replacingClashes[0].clashName ?? "this deck")\"?"
        }
        return "Replace \(replacingClashes.count) decks?"
    }

    var body: some View {
        Form {
            Section { promptDisclosure }

            Section("Paste JSON (one deck)") {
                TextEditor(text: $jsonText)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(minHeight: 140)
                    .overlay(alignment: .topLeading) {
                        if jsonText.isEmpty {
                            Text("{ \"deck_name\": … }")
                                .font(.system(.footnote, design: .monospaced))
                                .foregroundStyle(.tertiary)
                                .padding(.top, 8)
                                .allowsHitTesting(false)
                        }
                    }
                Button {
                    addCandidate(id: "paste", label: "Pasted JSON", text: jsonText)
                } label: {
                    Label("Validate", systemImage: "checkmark.circle")
                }
                .disabled(jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            Section {
                Button {
                    showFileImporter = true
                } label: {
                    Label(candidates.isEmpty ? "Choose .json file(s)" : "Add more .json files", systemImage: "folder")
                }
                Text("Pick several .json files at once — each is validated independently and you can drop any of them before importing.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach($candidates) { $candidate in
                candidateSection($candidate)
            }
        }
        .navigationTitle("Import decks")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                Button("Import \(importableCount)") {
                    if !replacingClashes.isEmpty {
                        showReplaceConfirm = true
                    } else {
                        runImportAll()
                    }
                }
                .disabled(importableCount == 0)
            }
        }
        .confirmationDialog(
            replaceConfirmTitle,
            isPresented: $showReplaceConfirm,
            titleVisibility: .visible
        ) {
            Button("Replace and delete history", role: .destructive) { runImportAll() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes current items, questions, review schedule and answer history for the replaced deck(s). This can't be undone.")
        }
        .onAppear {
            if let prefilledJSON, candidates.isEmpty {
                jsonText = prefilledJSON
                addCandidate(id: "paste", label: "Pasted JSON", text: prefilledJSON)
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.json, .plainText],
            allowsMultipleSelection: true
        ) { result in
            switch result {
            case .success(let urls):
                for url in urls {
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    if let text = try? String(contentsOf: url, encoding: .utf8) {
                        addCandidate(id: url.lastPathComponent, label: url.lastPathComponent, text: text)
                    } else {
                        candidates.append(
                            ImportCandidate(id: url.lastPathComponent, label: url.lastPathComponent, parseError: "Could not read this file.")
                        )
                    }
                }
            case .failure(let error):
                candidates.append(ImportCandidate(id: UUID().uuidString, label: "File import", parseError: error.localizedDescription))
            }
        }
    }

    private var promptDisclosure: some View {
        DisclosureGroup("🤖 No content yet? Copy the generator prompt for ChatGPT / Claude") {
            Text("Copy this, paste it into ChatGPT or Claude, add your course excerpt or LeetCode problem below it, and paste the JSON it returns back here.")
                .font(.caption)
                .foregroundStyle(.secondary)
            ScrollView {
                Text(PromptTemplate.text)
                    .font(.system(.caption2, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(height: 180)
            Button {
                UIPasteboard.general.string = PromptTemplate.text
                justCopiedPrompt = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { justCopiedPrompt = false }
            } label: {
                Label(justCopiedPrompt ? "Copied!" : "Copy prompt", systemImage: justCopiedPrompt ? "checkmark" : "doc.on.doc")
            }
            .buttonStyle(.borderedProminent)
        }
    }

    @ViewBuilder
    private func candidateSection(_ candidate: Binding<ImportCandidate>) -> some View {
        Section {
            HStack {
                Text(candidate.wrappedValue.label).font(.subheadline.weight(.semibold))
                Spacer()
                Button {
                    removeCandidate(candidate.wrappedValue.id)
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            if let parseError = candidate.wrappedValue.parseError {
                Label(parseError, systemImage: "xmark.octagon.fill")
                    .foregroundStyle(.red)
                    .font(.footnote)
            } else if let v = candidate.wrappedValue.validated {
                LabeledContent("Name", value: v.dto.deckName)
                LabeledContent("Items", value: "\(v.itemCount)")
                LabeledContent("Questions", value: "\(v.questionCount)")

                if !v.errors.isEmpty {
                    ForEach(v.errors) { issue in
                        issueRow(issue, color: .red, icon: "xmark.circle.fill")
                    }
                } else if !v.warnings.isEmpty {
                    ForEach(v.warnings) { issue in
                        issueRow(issue, color: .orange, icon: "exclamationmark.triangle.fill")
                    }
                } else {
                    Label("Looks good", systemImage: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .font(.footnote)
                }

                if let clashName = candidate.wrappedValue.clashName, v.isImportable {
                    Label("\"\(clashName)\" already exists", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                        .font(.footnote)
                    Picker("On import", selection: candidate.resolution) {
                        ForEach(DuplicateResolution.allCases) { option in
                            VStack(alignment: .leading) {
                                Text(option.label)
                                Text(option.hint).font(.caption).foregroundStyle(.secondary)
                            }
                            .tag(option)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                }
            }
        }
    }

    private func issueRow(_ issue: ImportIssue, color: Color, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Label(issue.message, systemImage: icon)
                .font(.footnote)
                .foregroundStyle(color)
            Text(issue.path)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
        }
    }

    private func addCandidate(id: String, label: String, text: String) {
        let previousResolution = candidates.first(where: { $0.id == id })?.resolution ?? .importAsCopy
        var candidate = ImportCandidate(id: id, label: label, resolution: previousResolution)

        switch ImportValidator.parse(text) {
        case .failure(let error):
            candidate.parseError = error.errorDescription
        case .success(let dto):
            let validated = ImportValidator.validate(dto)
            candidate.validated = validated
            candidate.clashName = ImportService.existingDeck(named: dto.deckName, in: context)?.name
        }

        if let idx = candidates.firstIndex(where: { $0.id == id }) {
            candidates[idx] = candidate
        } else {
            candidates.append(candidate)
        }
    }

    private func removeCandidate(_ id: String) {
        candidates.removeAll { $0.id == id }
    }

    private func runImportAll() {
        for candidate in candidates where candidate.validated?.isImportable == true {
            guard let validated = candidate.validated else { continue }
            try? ImportService.save(validated.dto, resolution: candidate.resolution, in: context)
        }
        candidates.removeAll { $0.validated?.isImportable == true }
        if candidates.isEmpty {
            jsonText = ""
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { dismiss() }
        }
    }
}
