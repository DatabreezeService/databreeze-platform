import type {
  EtlProposalRecordV1,
  EtlProposalRepositoryPortV1,
} from '../application/etl-proposal-repository.port.js';

export class InMemoryEtlProposalRepositoryAdapter implements EtlProposalRepositoryPortV1 {
  private readonly records = new Map<string, EtlProposalRecordV1>();

  public save(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    this.records.set(record.proposalId, Object.freeze({ ...record }));
    return Promise.resolve(this.records.get(record.proposalId)!);
  }

  public findById(proposalId: string): Promise<EtlProposalRecordV1 | undefined> {
    return Promise.resolve(this.records.get(proposalId));
  }

  public async update(record: EtlProposalRecordV1): Promise<EtlProposalRecordV1> {
    return this.save(record);
  }
}
