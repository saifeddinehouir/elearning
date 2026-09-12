import SwiftUI
import SwiftData
import UniformTypeIdentifiers

struct ImportView: View {
    var prefilledJSON: String?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var jsonText = ""
    @State private var showFileImporter = false
    @State private var parseError: String?
    @State private var validated: ValidatedImport?
    @State private var resolution: DuplicateResolution = .replaceExisting
    @State private var importedSummary: String?

    private var nameClash: Bool {
        guard let validated else { return false }
        return ImportService.existingDeck(named: validated.dto.deckName, in: context) != nil
    }

    var body: some View {
        Form {
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
                    Button("Import", action: runImport)
                        .disabled(!(validated?.isImportable ?? false))
                }
            }
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
            Section("A deck named \"\(v.dto.deckName)\" already exists") {
                Picker("On import", selection: $resolution) {
                    ForEach(DuplicateResolution.allCases) { Text($0.label).tag($0) }
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
