import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
} from '../application/etl-proposal-repository.port.js';

export class InMemoryEtlProposalRepositoryAdapter implements EtlProposalRepositoryPortV1 {
  private readonly records = new Map<string, EtlProposalRecordV1>();

  public async save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    this.records.set(record.proposalId, Object.freeze({ ...record }));
    return this.records.get(record.proposalId)!;
  }

  public async findById(proposalId: string): Promise<EtlProposalRecordV1 | undefined> {
    return this.records.get(proposalId);
  }

  public async update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    return this.save(record);
  }
}
