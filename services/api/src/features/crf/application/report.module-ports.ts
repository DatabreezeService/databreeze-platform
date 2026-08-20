import type { DatasetVersionRepositoryPortV1 } from '../../dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetRepositoryPortV1 } from '../../dsm/application/governed-dataset-repository.port.js';

export const CRF_GOVERNED_DATASET_REPOSITORY_PORT = Symbol('CRF_GOVERNED_DATASET_REPOSITORY_PORT');
export const CRF_DATASET_VERSION_REPOSITORY_PORT = Symbol('CRF_DATASET_VERSION_REPOSITORY_PORT');

export type CrfGovernedDatasetRepositoryPortV1 = GovernedDatasetRepositoryPortV1;
export type CrfDatasetVersionRepositoryPortV1 = DatasetVersionRepositoryPortV1;
