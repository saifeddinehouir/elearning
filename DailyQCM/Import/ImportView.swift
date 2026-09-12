import SwiftUI
import SwiftData
import UniformTypeIdentifiers
import UIKit

struct ImportView: View {
    var prefilledJSON: String?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var jsonText = ""
    @State private var showFileImporter = false
    @State private var parseError: String?
    @State private var validated: ValidatedImport?
    // Default to the non-destructive choice: a name clash should never silently
    // delete an existing deck's history unless the user deliberately picks that.
    @State private var resolution: DuplicateResolution = .importAsCopy
    @State private var showReplaceConfirm = false
    @State private var importedSummary: String?
    @State private var justCopiedPrompt = false

    private var nameClash: Bool {
        guard let validated else { return false }
        return ImportService.existingDeck(named: validated.dto.deckName, in: context) != nil
    }

    var body: some View {
        Form {
            Section {
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

            Section("Paste JSON") {
                TextEditor(text: $jsonText)
                    .font(.system(.footnote, design: .monospaced))
                    .frame(minHeight: 180)
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
                    showFileImporter = true
                } label: {
                    Label("Choose a .json file", systemImage: "folder")
                }
            }

            if let parseError {
                Section {
                    Label(parseError, systemImage: "xmark.octagon.fill")
                        .foregroundStyle(.red)
                        .font(.footnote)
                }
            }

            if let validated {
                summarySection(validated)
            }

            if let importedSummary {
                Section {
                    Label(importedSummary, systemImage: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                }
            }
        }
        .navigationTitle("Import deck")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
            }
            ToolbarItem(placement: .primaryAction) {
                if validated == nil {
                    Button("Validate", action: runValidation)
                        .disabled(jsonText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                } else {
                    Button("Import") {
                        if nameClash && resolution == .replaceExisting {
                            showReplaceConfirm = true
                        } else {
                            runImport()
                        }
                    }
                    .disabled(!(validated?.isImportable ?? false))
                }
            }
        }
        .confirmationDialog(
            "Replace \"\(validated?.dto.deckName ?? "this deck")\"?",
            isPresented: $showReplaceConfirm,
            titleVisibility: .visible
        ) {
            Button("Replace and delete history", role: .destructive) { runImport() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes its current items, questions, review schedule and answer history. This can't be undone.")
        }
        .onChange(of: jsonText) { _, _ in
            validated = nil
            parseError = nil
            importedSummary = nil
        }
        .onAppear {
            if let prefilledJSON, jsonText.isEmpty {
                jsonText = prefilledJSON
                runValidation()
            }
        }
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.json, .plainText],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                if let text = try? String(contentsOf: url, encoding: .utf8) {
                    jsonText = text
                    runValidation()
                } else {
                    parseError = "Could not read \(url.lastPathComponent)."
                }
            case .failure(let error):
                parseError = error.localizedDescription
            }
        }
    }

    @ViewBuilder
    private func summarySection(_ v: ValidatedImport) -> some View {
        Section("Deck") {
            LabeledContent("Name", value: v.dto.deckName)
            LabeledContent("Source", value: (SourceType(rawValue: v.dto.sourceType) ?? .course).label)
            LabeledContent("Items", value: "\(v.itemCount)")
            LabeledContent("Questions", value: "\(v.questionCount)")
            LabeledContent("Topics", value: v.topics.joined(separator: ", "))
        }

        if !v.errors.isEmpty {
            Section("Errors — fix these before importing") {
                ForEach(v.errors) { issue in
                    issueRow(issue, color: .red, icon: "xmark.circle.fill")
                }
            }
        }
        if !v.warnings.isEmpty {
            Section("Warnings") {
                ForEach(v.warnings) { issue in
                    issueRow(issue, color: .orange, icon: "exclamationmark.triangle.fill")
                }
            }
        }
        if v.isImportable && v.warnings.isEmpty {
            Section {
                Label("Schema looks good.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }

        if nameClash {
            Section {
                Label("A deck named \"\(v.dto.deckName)\" already exists.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
                Picker("On import", selection: $resolution) {
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

    private func runValidation() {
        importedSummary = nil
        switch ImportValidator.parse(jsonText) {
        case .failure(let error):
            parseError = error.errorDescription
            validated = nil
        case .success(let dto):
            parseError = nil
            validated = ImportValidator.validate(dto)
        }
    }

    private func runImport() {
        guard let validated, validated.isImportable else { return }
        do {
            let deck = try ImportService.save(validated.dto, resolution: resolution, in: context)
            importedSummary = "Imported \(deck.name) — \(deck.items.count) items, \(deck.questionCount) questions."
            jsonText = ""
            self.validated = nil
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { dismiss() }
        } catch {
            parseError = "Save failed: \(error.localizedDescription)"
        }
    }
}
